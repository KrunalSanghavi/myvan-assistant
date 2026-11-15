package io.github.krunalsanghavi.myvan.core.model

/** How a value is shown. Internal values are metric; screens convert at display time. */
enum class Kind { RPM, SPEED, PCT, KPA, GS, DEG, TEMP, TRIM, LAMBDA, VOLT, VOLT2, SEC, DIST }

/**
 * One OBD-II mode 01 reading the app knows about, as in `PARAMS` in index.html.
 * [bytes] is how many data bytes follow `41 <pid>`. [fast] readings are polled every cycle.
 */
data class PidDef(
    val key: String,
    val pid: Int,
    val bytes: Int,
    val name: String,
    val kind: Kind,
    val fast: Boolean = false,
)

/** A decoded value with the time it came in (milliseconds). Battery voltage uses the key `batt`. */
data class Reading(val key: String, val value: Double, val atMillis: Long)
