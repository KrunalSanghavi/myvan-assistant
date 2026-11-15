package io.github.krunalsanghavi.myvan.core.obd

import io.github.krunalsanghavi.myvan.core.model.Reading
import io.github.krunalsanghavi.myvan.core.obd.SafeCommand.At
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/** The adapter did not identify as an ELM327, so the app will not talk to it (section B). */
class NotAnElm327(reply: String) : Exception("Not an ELM327 adapter: ${reply.trim()}")

/** What setup learned about the adapter and the van. */
data class VanInfo(val elmVersion: String, val protocolNumber: String, val supported: Set<Int>)

/** The connect sequence from index.html: reset, settings, find the protocol, read the supported PIDs. */
suspend fun AdapterLink.connectVan(): VanInfo {
    val ver = control(SafeCommand.at(At.RESET), 5_000)
    val elm = Regex("ELM327\\s*v?[\\d.]+", RegexOption.IGNORE_CASE).find(ver)?.value ?: throw NotAnElm327(ver)
    for (a in listOf(At.ECHO_OFF, At.LINEFEEDS_OFF, At.SPACES_OFF, At.HEADERS_OFF, At.ADAPTIVE_TIMING)) control(SafeCommand.at(a))
    control(SafeCommand.protocol(0))
    ElmCodec.parse(control(SafeCommand.current(0x00), 12_000))   // throws UnableToConnect
    val dpn = control(SafeCommand.at(At.PROTOCOL_NUMBER)).uppercase().filter { it in "0123456789ABC" }.takeLast(1)
    return VanInfo(elm, dpn, readSupported())
}

/** Port of `readSupported`: the 0100, 0120, … bitmaps, combined across computers that answer. */
suspend fun AdapterLink.readSupported(): Set<Int> {
    val out = mutableSetOf<Int>()
    for (base in 0x00..0xA0 step 0x20) {
        if (base != 0 && base !in out) break
        val msgs = try { ElmCodec.parse(control(SafeCommand.current(base), 4_000)) } catch (e: UnableToConnect) { break }
        val ms = msgs.filter { it.bytes.size >= 2 && it.bytes[0] == 0x41 && it.bytes[1] == base }
        if (ms.isEmpty()) break
        for (m in ms) {
            val d = m.bytes.drop(2).take(4)
            for (i in 0 until 32) if (i shr 3 < d.size && (d[i shr 3] and (0x80 shr (i and 7))) != 0) out += base + i + 1
        }
    }
    return out
}

/**
 * Port of `pollLoop`: fast readings every cycle, three slow ones in turn, battery voltage every sixth cycle.
 * Timeouts are counted by [AdapterLink]; the flow ends when the link stops.
 */
class Poller(
    private val link: AdapterLink,
    supported: Set<Int>,
    private val clock: () -> Long,
    private val cycleDelayMs: Long = 220,
) {
    private val live = PidTable.forVan(supported)
    private val fast = live.filter { it.def.fast }
    private val slow = live.filter { !it.def.fast }
    private val volts = Regex("""(\d+(\.\d+)?)\s*V""", RegexOption.IGNORE_CASE)

    fun readings(): Flow<Reading> = flow {
        var cycle = 0
        var si = 0
        while (!link.stopped.value) {
            for (d in fast) read(d)?.let { emit(it) }
            repeat(minOf(3, slow.size)) { read(slow[si++ % slow.size])?.let { emit(it) } }
            if (cycle % 6 == 0) battery()?.let { emit(it) }
            cycle++
            delay(cycleDelayMs)
        }
    }

    private suspend fun ask(cmd: SafeCommand): String? = try {
        link.poll(cmd)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null   // timeouts and bus faults: AdapterLink counts them and stops if they keep coming
    }

    private suspend fun read(d: PidDecoder): Reading? {
        val raw = ask(SafeCommand.current(d.def.pid)) ?: return null
        val msgs = try { ElmCodec.parse(raw) } catch (e: UnableToConnect) { return null }
        val data = ElmCodec.data(msgs, 0x41, d.def.pid) ?: return null
        return d.decode(data)?.let { Reading(d.def.key, it, clock()) }
    }

    private suspend fun battery(): Reading? {
        val raw = ask(SafeCommand.at(At.READ_VOLTAGE)) ?: return null
        return volts.find(raw)?.groupValues?.get(1)?.toDoubleOrNull()?.let { Reading("batt", it, clock()) }
    }
}
