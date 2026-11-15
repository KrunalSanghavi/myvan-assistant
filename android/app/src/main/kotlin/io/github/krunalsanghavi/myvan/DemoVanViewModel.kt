package io.github.krunalsanghavi.myvan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.github.krunalsanghavi.myvan.core.obd.AdapterLink
import io.github.krunalsanghavi.myvan.core.obd.Poller
import io.github.krunalsanghavi.myvan.core.obd.connectVan
import io.github.krunalsanghavi.myvan.core.testing.FakeVanTransport
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Latest metric values by key (`speed`, `rpm`, `ect`, `batt`, …) and a one-line status. */
data class DemoVanState(val status: String = "Connecting to the demo van…", val values: Map<String, Double> = emptyMap())

/** Runs AdapterLink and Poller over the demo van, as PR 2 will over Bluetooth. */
class DemoVanViewModel : ViewModel() {
    private val _state = MutableStateFlow(DemoVanState())
    val state: StateFlow<DemoVanState> = _state.asStateFlow()

    private val clock = { System.currentTimeMillis() }
    private val van = FakeVanTransport(viewModelScope, clock)
    private val link = AdapterLink(van, viewModelScope)

    init {
        viewModelScope.launch {
            try {
                val info = link.connectVan()
                _state.update { it.copy(status = "Connected to the demo van") }
                Poller(link, info.supported, clock).readings().collect { r ->
                    _state.update { it.copy(values = it.values + (r.key to r.value)) }
                }
                _state.update { it.copy(status = "Lost contact with the adapter.") }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(status = "Couldn't connect: ${e.message}") }
            }
        }
    }

    override fun onCleared() {
        link.close()
    }
}
