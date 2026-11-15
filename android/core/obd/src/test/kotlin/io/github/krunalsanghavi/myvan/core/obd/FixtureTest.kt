package io.github.krunalsanghavi.myvan.core.obd

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.fail

/** Golden fixtures written by `npm run fixtures` from the JS in index.html. */
class FixtureTest {
    private fun fixture(name: String): JsonElement {
        val text = javaClass.getResourceAsStream("/fixtures/$name")!!.bufferedReader().use { it.readText() }
        return Json.parseToJsonElement(text)
    }

    private fun ints(e: JsonElement) = e.jsonArray.map { it.jsonPrimitive.int }

    // Acceptance test 1
    @Test
    fun everyPidDecodesLikeTheJs() {
        val pids = fixture("pids.json").jsonArray
        assertEquals(pids.size, PidTable.byPid.size, "PidTable and PARAMS have a different number of PIDs")
        var checked = 0
        for (p in pids) {
            val o = p.jsonObject
            val pid = o.getValue("pid").jsonPrimitive.int
            val dec = assertNotNull(PidTable.byPid[pid], "PID ${pid.toString(16)} is in PARAMS but not in PidTable")
            assertEquals(o.getValue("key").jsonPrimitive.content, dec.def.key, "key for PID ${pid.toString(16)}")
            assertEquals(o.getValue("n").jsonPrimitive.int, dec.def.bytes, "byte count for PID ${pid.toString(16)}")
            for (s in o.getValue("samples").jsonArray) {
                val bytes = ints(s.jsonObject.getValue("bytes")).toIntArray()
                val want = s.jsonObject.getValue("value")
                val got = dec.decode(bytes)
                if (want is JsonNull) {
                    assertNull(got, "PID ${pid.toString(16)} ${bytes.toList()} should not decode")
                } else {
                    val w = want.jsonPrimitive.double
                    if (got == null || abs(got - w) > 0.01) fail("PID ${pid.toString(16)} ${bytes.toList()}: JS $w, Kotlin $got")
                }
                checked++
            }
        }
        assertTrue(checked > 100, "only $checked samples")
    }

    // Acceptance test 2
    @Test
    fun elmCodecParsesLikeParseMsgs() {
        val cases = fixture("transcripts.json").jsonArray
        for (c in cases) {
            val o = c.jsonObject
            val raw = o.getValue("raw").jsonPrimitive.content
            if ("error" in o) {
                assertFailsWith<UnableToConnect>(raw) { ElmCodec.parse(raw) }
            } else {
                val want = o.getValue("msgs").jsonArray.map { ints(it) }
                assertEquals(want, ElmCodec.parse(raw).map { it.bytes }, "parse of ${raw.replace("\r", "\\r")}")
            }
        }
        val raws = cases.map { it.jsonObject.getValue("raw").jsonPrimitive.content }
        for (needed in listOf("NO DATA", "SEARCHING...", "UNABLE TO CONNECT", "0:", "7E8")) {
            assertTrue(raws.any { needed in it }, "fixtures should cover $needed")
        }
    }

    @Test
    fun findSafeMatchesTheJs() {
        val f = fixture("find_safe.json").jsonObject
        assertEquals(f.getValue("source").jsonPrimitive.content, SafeCommand.FIND_SAFE_PATTERN)
        val accept = f.getValue("accept").jsonArray.map { it.jsonPrimitive.content }
        assertTrue(accept.isNotEmpty())
        for (a in accept) assertEquals(a, SafeCommand.diagRead(a).text)
        for (r in f.getValue("reject").jsonArray.map { it.jsonPrimitive.content }) {
            assertFailsWith<BlockedCommand>(r) { SafeCommand.diagRead(r) }
        }
    }
}
