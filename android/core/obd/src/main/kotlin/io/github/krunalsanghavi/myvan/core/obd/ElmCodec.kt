package io.github.krunalsanghavi.myvan.core.obd

/** The adapter is fine but the van did not answer (ignition off, or wrong protocol). */
class UnableToConnect : Exception("UNABLE TO CONNECT")

/** One reply from one computer: the service byte first, as `parseMsgs` returns it. */
data class ElmMessage(val bytes: List<Int>)

/**
 * Port of `parseMsgs` in index.html. Golden fixtures (`transcripts.json`) keep the two in step:
 * run `npm run fixtures` after changing `parseMsgs`.
 */
object ElmCodec {
    private val NOISE = Regex("""(SEARCHING\.\.\.|BUS INIT:?\s*(OK|\.\.\.)?|STOPPED|OK)""")
    private val LINE_BREAKS = Regex("[\r\n]+")
    private val SPACE = Regex("\\s")
    private val SKIP = Regex("""NODATA|\?|ERROR""")
    private val FRAME_COUNT = Regex("^[0-9A-F]{3}$")
    private val FRAME = Regex("^([0-9A-F]):([0-9A-F]*)$")
    private val HEX = Regex("^[0-9A-F]+$")
    private val PAIR = Regex("[0-9A-F]{2}")
    private val BUS_FAULT = Regex("CAN ERROR|BUS BUSY|BUFFER FULL|BUS ERROR")

    /** @throws UnableToConnect when the adapter says so. */
    fun parse(raw: String): List<ElmMessage> {
        val lines = raw.replace(NOISE, "").split(LINE_BREAKS)
            .map { it.replace(SPACE, "").uppercase() }
            .filter { it.isNotEmpty() }
        if (lines.any { "UNABLETOCONNECT" in it }) throw UnableToConnect()
        val msgs = mutableListOf<MutableList<Int>>()
        var cur: MutableList<Int>? = null
        for (l in lines) {
            if (SKIP.containsMatchIn(l)) continue
            if (FRAME_COUNT.matches(l)) {
                cur = mutableListOf<Int>().also { msgs += it }
                continue
            }
            val m = FRAME.matchEntire(l)
            if (m != null) {
                val c = cur ?: mutableListOf<Int>().also { msgs += it; cur = it }
                c += hex(m.groupValues[2])
                continue
            }
            if (HEX.matches(l)) {
                msgs += hex(l).toMutableList()
                cur = null
            }
        }
        return msgs.map { ElmMessage(it.toList()) }
    }

    /** The data bytes after `<sid> <pid>` in the first message that answers them, or null. */
    fun data(msgs: List<ElmMessage>, sid: Int, pid: Int): IntArray? =
        msgs.firstOrNull { it.bytes.size >= 2 && it.bytes[0] == sid && it.bytes[1] == pid }
            ?.bytes?.drop(2)?.toIntArray()

    /** Bus trouble that, like a timeout, counts towards stopping all sending (section B). */
    fun isBusFault(raw: String): Boolean = BUS_FAULT.containsMatchIn(raw.uppercase())

    private fun hex(s: String): List<Int> = PAIR.findAll(s).map { it.value.toInt(16) }.toList()
}
