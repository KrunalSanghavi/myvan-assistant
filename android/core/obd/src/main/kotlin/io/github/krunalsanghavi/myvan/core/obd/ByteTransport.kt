package io.github.krunalsanghavi.myvan.core.obd

import kotlinx.coroutines.channels.ReceiveChannel

/**
 * The byte pipe to an ELM327 adapter (BLE in PR 2, the demo van in tests and debug builds).
 * A transport only moves bytes. The bytes it is given come from [ElmSession], which accepts
 * nothing but [SafeCommand]s, so only `:core:obd` decides what the adapter is told.
 */
interface ByteTransport {
    /** Bytes from the adapter, in order, as they arrive. Read only by [ElmSession]. */
    val incoming: ReceiveChannel<ByteArray>

    suspend fun write(bytes: ByteArray)

    suspend fun close()
}
