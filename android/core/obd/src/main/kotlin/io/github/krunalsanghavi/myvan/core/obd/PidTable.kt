package io.github.krunalsanghavi.myvan.core.obd

import io.github.krunalsanghavi.myvan.core.model.Kind
import io.github.krunalsanghavi.myvan.core.model.PidDef

/** A PID and how to turn its data bytes into a metric value. */
class PidDecoder(val def: PidDef, private val f: (IntArray) -> Double) {
    /** Null when there are too few bytes or the bytes make no sense (for example, no sensor fitted). */
    fun decode(data: IntArray): Double? =
        if (data.size < def.bytes) null else f(data).takeIf { it.isFinite() }
}

/**
 * Port of the decoders in `PARAMS` in index.html. Golden fixtures (`pids.json`) check every PID,
 * including the alternative PIDs, against the JS. Run `npm run fixtures` after changing `PARAMS`.
 */
object PidTable {
    private fun u16(b: IntArray) = b[0] * 256 + b[1]
    private val pct: (IntArray) -> Double = { b -> b[0] * 100 / 255.0 }
    private val temp: (IntArray) -> Double = { b -> b[0] - 40.0 }
    private val trim: (IntArray) -> Double = { b -> (b[0] - 128) * 100 / 128.0 }
    private val lambda: (IntArray) -> Double = { b -> u16(b) * 2 / 65536.0 }
    private val catTemp: (IntArray) -> Double = { b -> u16(b) / 10.0 - 40 }
    private val o2: (IntArray) -> Double = { b -> b[0] / 200.0 }
    private val raw: (IntArray) -> Double = { b -> b[0].toDouble() }

    // Newer multi-sensor PIDs (66 airflow, 67 coolant, 68 intake air): byte A says which sensors are fitted.
    private fun firstSensor(b: IntArray): Int {
        for (i in 0 until 6) if ((b[0] and (1 shl i)) != 0) return i
        return 0
    }
    private val altTemp: (IntArray) -> Double = { b ->
        val i = firstSensor(b)
        if (b.size > 1 + i) b[1 + i] - 40.0 else Double.NaN
    }
    private val altMaf: (IntArray) -> Double = { b ->
        val i = firstSensor(b)
        if (b.size > 2 + i * 2) (b[1 + i * 2] * 256 + b[2 + i * 2]) / 32.0 else Double.NaN
    }

    private fun p(key: String, pid: Int, n: Int, name: String, kind: Kind, fast: Boolean = false, f: (IntArray) -> Double) =
        PidDecoder(PidDef(key, pid, n, name, kind, fast), f)

    /** The standard PIDs, in the order of `PARAMS`. */
    val primary: List<PidDecoder> = listOf(
        p("rpm", 0x0C, 2, "Engine speed", Kind.RPM, fast = true) { b -> u16(b) / 4.0 },
        p("speed", 0x0D, 1, "Vehicle speed", Kind.SPEED, fast = true, f = raw),
        p("load", 0x04, 1, "Calculated engine load", Kind.PCT, fast = true, f = pct),
        p("tps", 0x11, 1, "Throttle position", Kind.PCT, fast = true, f = pct),
        p("map", 0x0B, 1, "Intake manifold pressure", Kind.KPA, f = raw),
        p("maf", 0x10, 2, "Mass airflow", Kind.GS, fast = true) { b -> u16(b) / 100.0 },
        p("timing", 0x0E, 1, "Ignition timing advance", Kind.DEG) { b -> b[0] / 2.0 - 64 },
        p("ect", 0x05, 1, "Coolant temperature", Kind.TEMP, f = temp),
        p("iat", 0x0F, 1, "Intake air temperature", Kind.TEMP, f = temp),
        p("amb", 0x46, 1, "Outside air temperature", Kind.TEMP, f = temp),
        p("oil", 0x5C, 1, "Engine oil temperature", Kind.TEMP, f = temp),
        p("cat1", 0x3C, 2, "Catalyst temperature, bank 1", Kind.TEMP, f = catTemp),
        p("cat2", 0x3D, 2, "Catalyst temperature, bank 2", Kind.TEMP, f = catTemp),
        p("stft1", 0x06, 1, "Short-term fuel trim, bank 1", Kind.TRIM, fast = true, f = trim),
        p("ltft1", 0x07, 1, "Long-term fuel trim, bank 1", Kind.TRIM, f = trim),
        p("stft2", 0x08, 1, "Short-term fuel trim, bank 2", Kind.TRIM, fast = true, f = trim),
        p("ltft2", 0x09, 1, "Long-term fuel trim, bank 2", Kind.TRIM, f = trim),
        p("lambda", 0x44, 2, "Commanded air-fuel ratio", Kind.LAMBDA, f = lambda),
        p("af1", 0x34, 4, "Upstream air-fuel sensor, bank 1", Kind.LAMBDA, f = lambda),
        p("af2", 0x38, 4, "Upstream air-fuel sensor, bank 2", Kind.LAMBDA, f = lambda),
        p("o2b1s2", 0x15, 2, "Downstream O2, bank 1", Kind.VOLT, f = o2),
        p("o2b2s2", 0x19, 2, "Downstream O2, bank 2", Kind.VOLT, f = o2),
        p("fuel", 0x2F, 1, "Fuel level", Kind.PCT, f = pct),
        p("ecuv", 0x42, 2, "Engine computer voltage", Kind.VOLT2) { b -> u16(b) / 1000.0 },
        p("baro", 0x33, 1, "Barometric pressure", Kind.KPA, f = raw),
        p("runtime", 0x1F, 2, "Time since engine start", Kind.SEC) { b -> u16(b).toDouble() },
        p("odo", 0xA6, 4, "Odometer", Kind.DIST) { b ->
            (b[0] * 16777216.0 + b[1] * 65536.0 + b[2] * 256.0 + b[3]) / 10
        },
    )

    /** Alternative PIDs some cars use instead of the standard one, keyed by the standard PID. */
    val alternatives: Map<Int, PidDecoder> = listOf(
        0x34 to p("af1", 0x24, 4, "Upstream air-fuel sensor, bank 1", Kind.LAMBDA, f = lambda),
        0x38 to p("af2", 0x28, 4, "Upstream air-fuel sensor, bank 2", Kind.LAMBDA, f = lambda),
        0x05 to p("ect", 0x67, 2, "Coolant temperature", Kind.TEMP, f = altTemp),
        0x0F to p("iat", 0x68, 2, "Intake air temperature", Kind.TEMP, f = altTemp),
        0x10 to p("maf", 0x66, 3, "Mass airflow", Kind.GS, fast = true, f = altMaf),
    ).toMap()

    val byPid: Map<Int, PidDecoder> = (primary + alternatives.values).associateBy { it.def.pid }

    fun decode(pid: Int, data: IntArray): Double? = byPid[pid]?.decode(data)

    /**
     * What to poll for a van that supports [supported]: the standard PID, or its alternative when only
     * that one is supported (as `readSupported` does).
     */
    fun forVan(supported: Set<Int>): List<PidDecoder> = primary.mapNotNull { d ->
        when {
            d.def.pid in supported -> d
            else -> alternatives[d.def.pid]?.takeIf { it.def.pid in supported }
        }
    }
}
