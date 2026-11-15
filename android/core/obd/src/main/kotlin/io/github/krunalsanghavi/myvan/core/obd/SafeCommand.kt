package io.github.krunalsanghavi.myvan.core.obd

/** A request that is not on the read-only allowlist. */
class BlockedCommand(text: String) : IllegalArgumentException("Blocked: \"$text\" is not on the read-only allowlist")

/**
 * The only requests the app can send to the adapter (docs/android-architecture.md, section B).
 *
 * Read-only by construction: the constructor is private, every factory goes through [parse], and the
 * text is `internal`, so code outside `:core:obd` can neither build a raw request nor read one back as bytes.
 * Allowed: OBD-II modes 01, 02, 03, 06, 07 and 09; a fixed list of AT commands; and the finder's
 * `FIND_SAFE` reads (UDS 22, KWP 21, 1A, UDS 19 02).
 * Never allowed, and never to be added without asking the owner: 04 (clear codes), 10 (session), 11 (reset),
 * 14 (clear), 27 (security), 2E (write), 31 (routine), ATPP (adapter settings) and ATMA (bus flood).
 */
class SafeCommand private constructor(internal val text: String) {
    override fun toString() = text
    override fun equals(other: Any?) = other is SafeCommand && other.text == text
    override fun hashCode() = text.hashCode()

    /** Fixed AT commands. */
    enum class At(internal val text: String) {
        RESET("ATZ"), IDENTIFY("ATI"), ECHO_OFF("ATE0"), LINEFEEDS_OFF("ATL0"), SPACES_OFF("ATS0"),
        HEADERS_OFF("ATH0"), HEADERS_ON("ATH1"), ADAPTIVE_TIMING("ATAT1"),
        DESCRIBE_PROTOCOL("ATDP"), PROTOCOL_NUMBER("ATDPN"), READ_VOLTAGE("ATRV"), LOW_POWER("ATLP"),
        RECEIVE_ADDRESS_RESET("ATCRA"), CAN_PRIORITY_18("ATCP18"),
        TIMEOUT_100MS("ATST19"), TIMEOUT_200MS("ATST32"), TIMEOUT_300MS("ATST4B"),
    }

    companion object {
        /** Same as `FIND_SAFE` in index.html; a fixture test checks they match. */
        const val FIND_SAFE_PATTERN = "^(22[0-9A-F]{4}|21[0-9A-F]{2}|1A[0-9A-F]{2}|1902[0-9A-F]{2})$"
        private val FIND_SAFE = Regex(FIND_SAFE_PATTERN)
        private val OBD = Regex("^(01[0-9A-F]{2}|02[0-9A-F]{4}|03|06[0-9A-F]{2}|07|09[0-9A-F]{2})$")
        private val AT_FIXED = At.entries.map { it.text }.toSet()
        private val AT_PARAM = listOf(
            Regex("^ATSP[0-9A-C]$"),                          // protocol
            Regex("^ATSH([0-9A-F]{3}|[0-9A-F]{6})$"),         // header (11-bit, or 29-bit priority + target + source)
            Regex("^ATCRA([0-9A-F]{3}|[0-9A-F]{8})$"),        // receive address
        )

        /** The one gate: null unless [text] is on the allowlist. Upper-case hex only, as `FIND_SAFE`. */
        internal fun parse(text: String): SafeCommand? {
            val ok = OBD.matches(text) || FIND_SAFE.matches(text) || text in AT_FIXED || AT_PARAM.any { it.matches(text) }
            return if (ok) SafeCommand(text) else null
        }

        private fun build(text: String) = parse(text) ?: throw BlockedCommand(text)
        private fun hex2(n: Int): String {
            require(n in 0..255) { "Not a byte: $n" }
            return n.toString(16).uppercase().padStart(2, '0')
        }

        fun at(cmd: At) = build(cmd.text)

        /** Mode 01: current data. */
        fun current(pid: Int) = build("01" + hex2(pid))

        /** Mode 02: freeze frame data. */
        fun freezeFrame(pid: Int, frame: Int = 0) = build("02" + hex2(pid) + hex2(frame))

        /** Mode 03: stored trouble codes. */
        fun storedCodes() = build("03")

        /** Mode 06: on-board self-test results. */
        fun selfTest(mid: Int) = build("06" + hex2(mid))

        /** Mode 07: pending trouble codes. */
        fun pendingCodes() = build("07")

        /** Mode 09: vehicle information (02 is the VIN). */
        fun vehicleInfo(type: Int) = build("09" + hex2(type))

        /** ATSP: 0 is automatic, 6 is CAN 11-bit 500k, 7 is CAN 29-bit 500k. */
        fun protocol(n: Int): SafeCommand {
            require(n in 0..12) { "No such protocol: $n" }
            return build("ATSP" + n.toString(16).uppercase())
        }

        fun header(hex: String) = build("ATSH$hex")

        fun receiveAddress(hex: String) = build("ATCRA$hex")

        /** A data finder read. Only `FIND_SAFE` requests pass. */
        fun diagRead(hex: String): SafeCommand {
            if (!FIND_SAFE.matches(hex)) throw BlockedCommand(hex)
            return build(hex)
        }
    }
}
