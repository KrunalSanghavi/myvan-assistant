package io.github.krunalsanghavi.myvan.core.obd

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Sending has stopped after repeated timeouts or bus errors, until the next connection. */
class LinkStopped : Exception("Stopped talking to the adapter after repeated timeouts")

/** The diagnostic lease was released or ran out; its request was not sent. */
class LeaseExpired : Exception("The diagnostic lease has ended")

/** The adapter answered with a bus fault (CAN ERROR, BUS BUSY, BUFFER FULL). */
class BusFault(reply: String) : Exception("Bus fault: ${reply.trim()}")

/**
 * The one owner of the adapter (section 5). A single coroutine takes requests from three lanes, in
 * priority order: control (setup, `ATLP`), then the holder of a diagnostic lease, then polling.
 *
 * - While a lease is held, polling waits. A lease ends on [Lease.release] or when it has been idle for
 *   its time-to-live (the screen that took it died); its restore commands then run before polling resumes.
 * - Fail-safe (section B): [timeoutsPerRound] timeouts or bus faults in a row make a round, after which
 *   all sending pauses for a back-off. After [maxRounds] rounds all sending stops for good ([stopped]).
 *   Any good reply starts the count again.
 */
class AdapterLink(
    transport: ByteTransport,
    private val scope: CoroutineScope,
    private val timeoutsPerRound: Int = 3,
    private val maxRounds: Int = 3,
    private val backoffMs: List<Long> = listOf(1_000, 2_000),
) {
    private val session = ElmSession(transport)

    private enum class Lane { CONTROL, LEASE, POLL }
    private class Req(val lane: Lane, val leaseId: Long, val cmd: SafeCommand, val timeoutMs: Long) {
        val reply = CompletableDeferred<String>()
    }
    private sealed interface Msg
    private class Send(val req: Req) : Msg
    private class Acquire(val ttlMs: Long, val restore: List<SafeCommand>, val grant: CompletableDeferred<Lease>) : Msg
    private class Release(val leaseId: Long) : Msg
    private class Expire(val leaseId: Long, val generation: Long) : Msg

    private val inbox = Channel<Msg>(Channel.UNLIMITED)
    private val _stopped = MutableStateFlow(false)
    private val _leased = MutableStateFlow(false)

    /** True once sending has stopped for good. */
    val stopped: StateFlow<Boolean> = _stopped.asStateFlow()

    /** True while a diagnostic lease is held (polling is paused). */
    val leased: StateFlow<Boolean> = _leased.asStateFlow()

    // State below is touched only by the worker coroutine.
    private val control = ArrayDeque<Req>()
    private val leaseLane = ArrayDeque<Req>()
    private val pollLane = ArrayDeque<Req>()
    private val waitingForLease = ArrayDeque<Acquire>()
    private var lease: Acquire? = null
    private var leaseId = 0L
    private var nextLeaseId = 1L
    private var generation = 0L
    private var expiry: Job? = null
    private var faults = 0
    private var rounds = 0

    private val worker: Job = scope.launch { run() }

    /** Setup and housekeeping. Runs before anything else that is waiting. */
    suspend fun control(cmd: SafeCommand, timeoutMs: Long = 2_000): String = request(Lane.CONTROL, 0, cmd, timeoutMs)

    /** Live data. Waits while a lease is held. */
    suspend fun poll(cmd: SafeCommand, timeoutMs: Long = 2_500): String = request(Lane.POLL, 0, cmd, timeoutMs)

    /**
     * Takes the adapter for a diagnostic job (finder, self-tests, code reads), pausing polling.
     * Waits if another lease is held. [restore] runs when the lease ends (for example, headers back to default).
     */
    suspend fun lease(ttlMs: Long = 30_000, restore: List<SafeCommand> = emptyList()): Lease {
        if (_stopped.value) throw LinkStopped()
        val grant = CompletableDeferred<Lease>()
        inbox.send(Acquire(ttlMs, restore, grant))
        return grant.await()
    }

    inner class Lease internal constructor(val id: Long) {
        /** @throws LeaseExpired if the lease has ended. Each request keeps the lease alive. */
        suspend fun send(cmd: SafeCommand, timeoutMs: Long = 600): String = request(Lane.LEASE, id, cmd, timeoutMs)

        fun release() {
            inbox.trySend(Release(id))
        }
    }

    /** Stops the worker. The caller closes the transport. */
    fun close() {
        worker.cancel()
        expiry?.cancel()
    }

    private suspend fun request(lane: Lane, leaseId: Long, cmd: SafeCommand, timeoutMs: Long): String {
        if (_stopped.value) throw LinkStopped()
        val req = Req(lane, leaseId, cmd, timeoutMs)
        inbox.send(Send(req))
        return req.reply.await()
    }

    private suspend fun run() {
        while (true) {
            while (true) handle(inbox.tryReceive().getOrNull() ?: break)
            val next = if (_stopped.value) null else pick()
            if (next == null) handle(inbox.receive()) else execute(next)
        }
    }

    private fun pick(): Req? =
        control.removeFirstOrNull() ?: if (lease != null) leaseLane.removeFirstOrNull() else pollLane.removeFirstOrNull()

    private fun handle(m: Msg) {
        when (m) {
            is Send -> {
                val r = m.req
                when {
                    _stopped.value -> r.reply.completeExceptionally(LinkStopped())
                    r.lane == Lane.CONTROL -> control += r
                    r.lane == Lane.POLL -> pollLane += r
                    r.leaseId != leaseId || lease == null -> r.reply.completeExceptionally(LeaseExpired())
                    else -> { leaseLane += r; armExpiry() }
                }
            }
            is Acquire -> if (_stopped.value) m.grant.completeExceptionally(LinkStopped()) else { waitingForLease += m; grantNext() }
            is Release -> if (m.leaseId == leaseId) endLease()
            is Expire -> if (m.leaseId == leaseId && m.generation == generation) endLease()
        }
    }

    private fun grantNext() {
        if (lease != null) return
        val a = waitingForLease.removeFirstOrNull() ?: return
        lease = a
        leaseId = nextLeaseId++
        _leased.value = true
        armExpiry()
        a.grant.complete(Lease(leaseId))
    }

    private fun armExpiry() {
        val a = lease ?: return
        val id = leaseId
        val gen = ++generation
        expiry?.cancel()
        expiry = scope.launch {
            delay(a.ttlMs)
            inbox.send(Expire(id, gen))
        }
    }

    private fun endLease() {
        val a = lease ?: return
        expiry?.cancel()
        lease = null
        leaseId = 0
        leaseLane.forEach { it.reply.completeExceptionally(LeaseExpired()) }
        leaseLane.clear()
        for (c in a.restore) control += Req(Lane.CONTROL, 0, c, 2_000)
        _leased.value = false
        grantNext()
    }

    private suspend fun execute(r: Req) {
        val reply = try {
            session.send(r.cmd, r.timeoutMs)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            r.reply.completeExceptionally(e)
            fault()
            return
        }
        if (ElmCodec.isBusFault(reply)) {
            r.reply.completeExceptionally(BusFault(reply))
            fault()
            return
        }
        faults = 0
        rounds = 0
        r.reply.complete(reply)
    }

    private suspend fun fault() {
        if (++faults < timeoutsPerRound) return
        faults = 0
        if (++rounds >= maxRounds) {
            stop()
            return
        }
        delay(backoffMs.getOrElse(rounds - 1) { backoffMs.lastOrNull() ?: 0 })
    }

    private fun stop() {
        _stopped.value = true
        expiry?.cancel()
        val failed = control + leaseLane + pollLane
        control.clear(); leaseLane.clear(); pollLane.clear()
        failed.forEach { it.reply.completeExceptionally(LinkStopped()) }
        waitingForLease.forEach { it.grant.completeExceptionally(LinkStopped()) }
        waitingForLease.clear()
        lease = null
        leaseId = 0
        _leased.value = false
    }
}
