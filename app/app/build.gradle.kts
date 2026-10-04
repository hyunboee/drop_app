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

    // 서버 주소는 flavor마다 한 곳에서 정한다. 두 앱은 이름과 패키지가 달라 한 폰에 함께 설치할 수 있다.
    flavorDimensions += "env"
    productFlavors {
        // 집: 같은 와이파이의 PC 서버에 adb reverse(localhost)로 붙는다. 무선 디버깅으로 설치·디버깅할 때 쓴다
        create("home") {
            dimension = "env"
            applicationIdSuffix = ".home"
            resValue("string", "app_name", "Drop 집")
            buildConfigField("String", "API_BASE_URL", "\"http://localhost:3000\"")
        }
        // 밖: 터널 주소(인터넷)로 붙는다. 빌드할 때 -PapiBaseUrl=https://....trycloudflare.com 을 준다.
        // 패키지 이름은 기존 com.hyunboee.drop 그대로라 구글 클라우드 앵커 인증(OAuth 클라이언트)이 이미 맞는다
        create("outdoor") {
            dimension = "env"
            resValue("string", "app_name", "Drop 밖")
            buildConfigField("String", "API_BASE_URL", "\"${providers.gradleProperty("apiBaseUrl").getOrElse("https://set-apiBaseUrl.invalid")}\"")
        }
    }

    // 다른 사람에게 나눠 줄 설치 파일(release). 구글 클라우드 앵커 인증(OAuth 클라이언트)이 등록된 디버그 서명 키로 서명한다.
    // 스토어 출시용이 아니다. 출시할 때는 별도의 출시 키로 바꾸고 OAuth 클라이언트도 다시 등록해야 한다
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
        }
    }

    compileOptions {
        // SceneView가 Java 21 타깃으로 빌드되어 있다
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    buildFeatures {
        compose = true
        buildConfig = true
        resValues = true // flavor별 앱 이름
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
    // 내 캡슐 지도(NW-19). OpenStreetMap 타일을 써서 API 키가 필요 없다
    implementation(libs.osmdroid)

    testImplementation(libs.junit)
    // JVM 단위 테스트에서 org.json을 실제로 돌리기 위한 것 (Android에는 기본 포함)
    testImplementation(libs.json)
}
