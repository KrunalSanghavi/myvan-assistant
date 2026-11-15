package io.github.krunalsanghavi.myvan.core.obd

import kotlinx.coroutines.withTimeoutOrNull

/** The adapter did not finish its answer (the `>` prompt) in time. */
class ElmTimeout(what: String) : Exception("No answer to $what")

/**
 * One request, one reply: writes a [SafeCommand] and reads until the ELM327's `>` prompt.
 *
 * After a timeout the adapter may still send the late reply. It must never be taken as the answer to
 * the next command (review item 5), so the next [send] first re-synchronises: it asks the adapter to
 * identify itself (`ATI`) and throws away everything up to that answer.
 *
 * Not thread-safe: [AdapterLink] is its only caller, from one coroutine.
 */
class ElmSession(
    private val transport: ByteTransport,
    private val resyncTimeoutMs: Long = 2000,
) {
    private val buf = StringBuilder()
    private var needsResync = false

    /** @throws ElmTimeout when the reply (or the re-sync before it) does not arrive in time. */
    suspend fun send(cmd: SafeCommand, timeoutMs: Long): String {
        if (needsResync) resync()
        drain()
        transport.write((cmd.text + "\r").encodeToByteArray())
        return withTimeoutOrNull(timeoutMs) { readToPrompt() }
            ?: run { needsResync = true; throw ElmTimeout(cmd.text) }
    }

    private suspend fun resync() {
        drain()
        transport.write((SafeCommand.at(SafeCommand.At.IDENTIFY).text + "\r").encodeToByteArray())
        withTimeoutOrNull(resyncTimeoutMs) {
            while (!readToPrompt().uppercase().contains("ELM327")) { /* a late reply: drop it */ }
            true
        } ?: throw ElmTimeout("ATI (re-sync)")
        needsResync = false
    }

    /** Drops anything that arrived while no command was waiting. */
    private fun drain() {
        while (transport.incoming.tryReceive().isSuccess) { /* stale */ }
        buf.clear()
    }

    private suspend fun readToPrompt(): String {
        while (true) {
            val i = buf.indexOf(">")
            if (i >= 0) {
                val out = buf.substring(0, i)
                buf.delete(0, i + 1)
                return out
            }
            buf.append(transport.incoming.receive().decodeToString())
        }
    }
}
