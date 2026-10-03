plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.hyunboee.drop"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.hyunboee.drop"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        // 폰(arm64)용 네이티브 라이브러리만 넣는다
        ndk { abiFilters += "arm64-v8a" }
    }

    compileOptions {
        // SceneView가 Java 21 타깃으로 빌드되어 있다
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)
    implementation(libs.sceneview.ar)
    // 클라우드 앵커 키 없는(keyless) 인증에 필요하다 (네이티브 PRD NQ-03)
    implementation(libs.play.services.auth)

    testImplementation(libs.junit)
}
