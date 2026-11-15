package io.github.krunalsanghavi.myvan.core.obd

import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

// Acceptance test 3
class SafeCommandTest {
    private val forbidden = listOf("04", "1003", "1001", "1101", "14FFFFFF", "14", "2701", "2EF19000", "2E", "3101FF00", "31",
        "ATPP0CSV", "ATPP0CON", "ATMA", "0A", "08", "05", "ATWS", "ATD", "AT@3", "ATBRD23")

    @Test
    fun forbiddenRequestsAreRefused() {
        for (f in forbidden) assertNull(SafeCommand.parse(f), "$f must be blocked")
        assertFailsWith<BlockedCommand> { SafeCommand.diagRead("2EF19000") }
        assertFailsWith<BlockedCommand> { SafeCommand.diagRead("1003") }
        assertFailsWith<BlockedCommand> { SafeCommand.header("7DF\rATMA") }
        assertFailsWith<BlockedCommand> { SafeCommand.receiveAddress("7E8;04") }
    }

    @Test
    fun typedRequestsBuildTheExpectedText() {
        assertEquals("010C", SafeCommand.current(0x0C).text)
        assertEquals("020C00", SafeCommand.freezeFrame(0x0C).text)
        assertEquals("03", SafeCommand.storedCodes().text)
        assertEquals("0605", SafeCommand.selfTest(0x05).text)
        assertEquals("07", SafeCommand.pendingCodes().text)
        assertEquals("0902", SafeCommand.vehicleInfo(0x02).text)
        assertEquals("ATSP7", SafeCommand.protocol(7).text)
        assertEquals("ATSHDA60F1", SafeCommand.header("DA60F1").text)
        assertEquals("ATCRA18DAF160", SafeCommand.receiveAddress("18DAF160").text)
        assertEquals("ATZ", SafeCommand.at(SafeCommand.At.RESET).text)
        for (a in SafeCommand.At.entries) assertNotNull(SafeCommand.parse(a.text))
    }

    /** An independent statement of section B's allowlist, to check the real one against. */
    private fun allowed(s: String): Boolean =
        Regex("^(01[0-9A-F]{2}|02[0-9A-F]{4}|03|06[0-9A-F]{2}|07|09[0-9A-F]{2})$").matches(s) ||
            Regex("^(22[0-9A-F]{4}|21[0-9A-F]{2}|1A[0-9A-F]{2}|1902[0-9A-F]{2})$").matches(s) ||
            s in setOf("ATZ", "ATI", "ATE0", "ATL0", "ATS0", "ATH0", "ATH1", "ATAT1", "ATDP", "ATDPN", "ATRV", "ATLP",
                "ATCRA", "ATCP18", "ATST19", "ATST32", "ATST4B") ||
            Regex("^ATSP[0-9A-C]$").matches(s) || Regex("^ATSH([0-9A-F]{3}|[0-9A-F]{6})$").matches(s) ||
            Regex("^ATCRA([0-9A-F]{3}|[0-9A-F]{8})$").matches(s)

    @Test
    fun randomHexOutsideTheAllowlistNeverPasses() {
        val rnd = Random(85)
        val hex = "0123456789ABCDEF"
        val starts = listOf("", "", "", "04", "10", "11", "14", "27", "2E", "31", "22", "21", "19", "1A", "01", "AT", "ATPP", "ATMA", "ATSH")
        var outside = 0
        repeat(20_000) {
            val s = starts[rnd.nextInt(starts.size)] + (1..rnd.nextInt(0, 10)).map { hex[rnd.nextInt(16)] }.joinToString("")
            val got = SafeCommand.parse(s)
            if (!allowed(s)) { outside++; assertNull(got, "$s is outside the allowlist") } else assertNotNull(got, s)
            val forbiddenStart = listOf("04", "10", "11", "14", "27", "2E", "31", "ATPP", "ATMA").any { s.startsWith(it) }
            if (forbiddenStart) assertNull(got, "$s starts with a forbidden service")
        }
        assertTrue(outside >= 10_000, "only $outside strings were outside the allowlist")
    }
}
