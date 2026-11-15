package io.github.krunalsanghavi.myvan.core.testing

import io.github.krunalsanghavi.myvan.core.model.Reading
import io.github.krunalsanghavi.myvan.core.obd.AdapterLink
import io.github.krunalsanghavi.myvan.core.obd.ElmCodec
import io.github.krunalsanghavi.myvan.core.obd.ElmTimeout
import io.github.krunalsanghavi.myvan.core.obd.LeaseExpired
import io.github.krunalsanghavi.myvan.core.obd.LinkStopped
import io.github.krunalsanghavi.myvan.core.obd.Poller
import io.github.krunalsanghavi.myvan.core.obd.SafeCommand
import io.github.krunalsanghavi.myvan.core.obd.connectVan
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** AdapterLink, ElmSession and Poller against the fake demo van, in virtual time. */
class AdapterLinkTest {
    private fun TestScope.van(faults: FaultScript = FaultScript.none) =
        FakeVanTransport(backgroundScope, { testScheduler.currentTime }, faults = faults)

    private fun TestScope.startPolling(link: AdapterLink, supported: Set<Int>): MutableList<Reading> {
        val readings = mutableListOf<Reading>()
        backgroundScope.launch { Poller(link, supported, { testScheduler.currentTime }).readings().collect { readings += it } }
        return readings
    }

    private fun isPoll(cmd: String) = cmd.startsWith("01") || cmd == "ATRV"

    @Test
    fun connectsToTheDemoVan() = runTest {
        val link = AdapterLink(van(), backgroundScope)
        val info = link.connectVan()
        assertEquals("ELM327 v1.5", info.elmVersion)
        assertEquals("6", info.protocolNumber)
        assertEquals(FakeVanTransport.livePids, info.supported.filter { it % 0x20 != 0 && it != 1 }.toSet())
    }

    // Stand-in for acceptance test 6 (the emulator check is manual): the values the demo screen shows change.
    @Test
    fun demoVanValuesChange() = runTest {
        val link = AdapterLink(van(), backgroundScope)
        val readings = startPolling(link, link.connectVan().supported)
        advanceTimeBy(45_000)
        val keys = readings.map { it.key }.toSet()
        assertTrue(keys.containsAll(listOf("speed", "rpm", "ect", "batt")), "got $keys")
        assertTrue(readings.filter { it.key == "speed" }.map { it.value }.distinct().size > 5, "speed should change")
        assertTrue(readings.filter { it.key == "rpm" }.map { it.value }.distinct().size > 5, "rpm should change")
    }

    // Acceptance test 4, part 1
    @Test
    fun leasePausesPollingAndPollingResumesAfterRelease() = runTest {
        val van = van()
        val link = AdapterLink(van, backgroundScope)
        val readings = startPolling(link, link.connectVan().supported)
        advanceTimeBy(2_000)
        assertTrue(readings.isNotEmpty())

        val lease = link.lease(ttlMs = 10_000, restore = listOf(SafeCommand.header("7DF")))
        val mark = van.received.size
        lease.send(SafeCommand.header("DA60F1"))
        lease.send(SafeCommand.diagRead("22F190"))
        advanceTimeBy(5_000)
        val during = van.received.drop(mark)
        assertEquals(listOf("ATSHDA60F1", "22F190"), during, "only the lease's requests while it is held")

        lease.release()
        advanceTimeBy(2_000)
        val after = van.received.drop(mark + during.size)
        assertEquals("ATSH7DF", after.first(), "headers are restored first")
        assertTrue(after.any(::isPoll), "polling resumes")
    }

    // Acceptance test 4, part 2
    @Test
    fun anExpiredLeaseIsReclaimed() = runTest {
        val van = van()
        val link = AdapterLink(van, backgroundScope)
        startPolling(link, link.connectVan().supported)
        val lease = link.lease(ttlMs = 3_000)
        val mark = van.received.size
        advanceTimeBy(2_000)
        assertTrue(link.leased.value)
        assertTrue(van.received.drop(mark).none(::isPoll))

        advanceTimeBy(2_000)   // the screen that took it never came back
        assertFalse(link.leased.value)
        assertFailsWith<LeaseExpired> { lease.send(SafeCommand.diagRead("22F190")) }
        advanceTimeBy(1_000)
        assertTrue(van.received.drop(mark).any(::isPoll), "polling resumes")
    }

    // Acceptance test 4, part 3
    @Test
    fun aLateReplyIsNeverGivenToTheNextCommand() = runTest {
        val van = van()
        val link = AdapterLink(van, backgroundScope)
        link.connectVan()
        van.faults = FaultScript.lateOnce("010C", 500)   // the answer comes 520 ms after the request

        assertFailsWith<ElmTimeout> { link.poll(SafeCommand.current(0x0C), timeoutMs = 300) }
        val reply = link.poll(SafeCommand.current(0x0D), timeoutMs = 2_000)
        val msgs = ElmCodec.parse(reply)
        assertNotNull(ElmCodec.data(msgs, 0x41, 0x0D), "got $reply")
        assertTrue(msgs.none { it.bytes.getOrNull(1) == 0x0C }, "the late engine-speed answer leaked: $reply")
        assertTrue("ATI" in van.received, "the link re-synchronised")

        // And it keeps working.
        assertNotNull(ElmCodec.data(ElmCodec.parse(link.poll(SafeCommand.current(0x0C))), 0x41, 0x0C))
    }

    // Acceptance test 5
    @Test
    fun threeRoundsOfTimeoutsStopAllSending() = runTest {
        val van = van()
        val link = AdapterLink(van, backgroundScope)
        startPolling(link, link.connectVan().supported)
        advanceTimeBy(1_000)
        van.faults = FaultScript.silent   // the adapter goes quiet

        advanceTimeBy(60_000)
        assertTrue(link.stopped.value)
        val sent = van.received.size
        advanceTimeBy(120_000)
        assertEquals(sent, van.received.size, "nothing is sent after stopping")
        assertFailsWith<LinkStopped> { link.control(SafeCommand.at(SafeCommand.At.IDENTIFY)) }
        assertFailsWith<LinkStopped> { link.lease() }
    }

    @Test
    fun busFaultsCountLikeTimeouts() = runTest {
        val van = van()
        val link = AdapterLink(van, backgroundScope)
        link.connectVan()
        van.faults = FaultScript { _, _ -> Fault.Reply("CAN ERROR") }
        repeat(9) { runCatching { link.poll(SafeCommand.current(0x0C)) } }
        assertTrue(link.stopped.value)
    }
}
