package io.github.krunalsanghavi.myvan.core.testing

import io.github.krunalsanghavi.myvan.core.obd.ByteTransport
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.Collections

/** What the fake van does with one command. */
sealed interface Fault {
    /** Answer normally. */
    data object None : Fault

    /** Never answer. */
    data object Silent : Fault

    /** Answer, but [extraMs] later than usual (after the app has given up, if longer than its timeout). */
    data class Late(val extraMs: Long) : Fault

    /** Answer with [text] instead (for example "CAN ERROR"). */
    data class Reply(val text: String) : Fault
}

/** Decides the [Fault] for the [n]th command (counting from 0) the van receives. */
fun interface FaultScript {
    fun faultFor(n: Int, cmd: String): Fault

    companion object {
        val none = FaultScript { _, _ -> Fault.None }
        val silent = FaultScript { _, _ -> Fault.Silent }

        /** The first command matching [cmd] answers [extraMs] late; everything else is normal. */
        fun lateOnce(cmd: String, extraMs: Long): FaultScript {
            var done = false
            return FaultScript { _, c -> if (!done && c == cmd) { done = true; Fault.Late(extraMs) } else Fault.None }
        }
    }
}

/**
 * The demo van as an ELM327 on the other end of a [ByteTransport]. Its answers come from
 * `demo-van.json`, which `npm run fixtures` records from the web app's `demo.emulate()` with a seeded
 * clock: setup answers, then each live PID once a second over the demo's 70-second drive loop.
 *
 * @param scope where replies are scheduled (a test's virtual-time scope, or the app's).
 * @param clock milliseconds, used to pick the point in the drive loop.
 */
class FakeVanTransport(
    private val scope: CoroutineScope,
    private val clock: () -> Long,
    private val latencyMs: Long = 20,
    @Volatile var faults: FaultScript = FaultScript.none,
) : ByteTransport {
    private val channel = Channel<ByteArray>(Channel.UNLIMITED)
    override val incoming: ReceiveChannel<ByteArray> get() = channel

    /** Every command received, in order (without the trailing CR). */
    val received: MutableList<String> = Collections.synchronizedList(mutableListOf())

    private val pending = StringBuilder()
    private val t0 = clock()

    override suspend fun write(bytes: ByteArray) {
        pending.append(bytes.decodeToString())
        while (true) {
            val i = pending.indexOf("\r")
            if (i < 0) break
            val cmd = pending.substring(0, i).trim().uppercase()
            pending.delete(0, i + 1)
            if (cmd.isNotEmpty()) answer(cmd)
        }
    }

    override suspend fun close() {
        channel.close()
    }

    private fun answer(cmd: String) {
        val n = received.size
        received += cmd
        val (text, wait) = when (val f = faults.faultFor(n, cmd)) {
            Fault.None -> emulate(cmd) to latencyMs
            Fault.Silent -> return
            is Fault.Late -> emulate(cmd) to latencyMs + f.extraMs
            is Fault.Reply -> f.text to latencyMs
        }
        // Like a real ELM327, answers come out in order: a late answer holds up the ones after it.
        val now = clock()
        val at = maxOf(now + wait, readyAt)
        readyAt = at
        scope.launch {
            delay(at - now)
            channel.trySend("$text\r\r>".encodeToByteArray())
        }
    }
    private var readyAt = Long.MIN_VALUE

    /** The demo van's answer to [cmd]. */
    fun emulate(cmd: String): String {
        series[cmd]?.let { s ->
            val i = (((clock() - t0) / 1000) % s.size).toInt()
            return s[i]
        }
        init[cmd]?.let { return it }
        return when {
            cmd.startsWith("AT") -> "OK"
            else -> "NO DATA"
        }
    }

    companion object {
        private val data by lazy {
            val text = FakeVanTransport::class.java.getResourceAsStream("/demo-van.json")!!.bufferedReader().use { it.readText() }
            Json.parseToJsonElement(text).jsonObject
        }
        private val init: Map<String, String> by lazy {
            data.getValue("init").jsonObject.mapValues { it.value.jsonPrimitive.content }
        }
        private val series: Map<String, List<String>> by lazy {
            data.getValue("series").jsonObject.mapValues { e -> e.value.jsonArray.map { it.jsonPrimitive.content } }
        }

        /** The PIDs the demo van supports, as read from its 0100… answers. */
        val livePids: Set<Int> by lazy { series.keys.filter { it.startsWith("01") }.map { it.substring(2).toInt(16) }.toSet() }
    }
}
