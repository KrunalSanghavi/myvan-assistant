package io.github.krunalsanghavi.myvan

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val vm: DemoVanViewModel = viewModel()
                    val state by vm.state.collectAsStateWithLifecycle()
                    DemoVanScreen(state)
                }
            }
        }
    }
}

/** Internal values are metric; shown in US units, as the web app's default. */
@Composable
fun DemoVanScreen(state: DemoVanState) {
    val v = state.values
    Column(
        modifier = Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Demo van", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.semantics { heading() })
        Text(state.status, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        Value("Speed", v["speed"]?.let { (it * 0.621371).roundToInt().toString() }, "mph")
        Value("Engine speed", v["rpm"]?.roundToInt()?.toString(), "rpm")
        Value("Coolant", v["ect"]?.let { (it * 9 / 5 + 32).roundToInt().toString() }, "°F")
        Value("Battery", v["batt"]?.let { ((it * 10).roundToInt() / 10.0).toString() }, "V")
        Text(
            "Pretend data from the built-in demo van. No adapter is used yet.",
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
private fun Value(label: String, value: String?, unit: String) {
    Row(
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(label, style = MaterialTheme.typography.titleLarge)
        Text(if (value == null) "—" else "$value $unit", style = MaterialTheme.typography.displaySmall)
    }
}
