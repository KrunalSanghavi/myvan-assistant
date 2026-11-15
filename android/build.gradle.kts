plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.compose) apply false
}

// Module rules (docs/android-architecture.md, section A), checked on every build.
// :core:model and :core:obd stay pure Kotlin; only the listed modules may use :core:obd.
val obdUsers = setOf(":app", ":core:testing")
val pureKotlin = setOf(":core:model", ":core:obd")
subprojects {
    afterEvaluate {
        if (path in pureKotlin && plugins.hasPlugin("com.android.base")) {
            throw GradleException("$path must stay a pure Kotlin/JVM module")
        }
        configurations.filter { !it.name.startsWith("test") }.forEach { c ->
            c.dependencies.withType<ProjectDependency>().forEach { d ->
                if (d.path == ":core:obd" && path !in obdUsers) {
                    throw GradleException("$path must not depend on :core:obd (see docs/android-architecture.md, section A)")
                }
                if (path in pureKotlin && d.path !in pureKotlin) {
                    throw GradleException("$path may only depend on pure Kotlin modules, not ${d.path}")
                }
            }
        }
    }
}
