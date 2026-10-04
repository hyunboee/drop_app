package com.hyunboee.drop

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.hyunboee.drop.api.ApiClient
import com.hyunboee.drop.ar.SpikeScreen
import com.hyunboee.drop.auth.Session
import com.hyunboee.drop.auth.TokenStore
import com.hyunboee.drop.ui.Home
import com.hyunboee.drop.ui.IntroScreen
import com.hyunboee.drop.ui.HomeData
import com.hyunboee.drop.ui.LoginScreen
import com.hyunboee.drop.ui.MapPin
import com.hyunboee.drop.ui.SignupScreen
import com.hyunboee.drop.ui.Tokens
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val session = Session(TokenStore(applicationContext), TokenStore(applicationContext, "login", "drop_login"))
        session.api = ApiClient(BuildConfig.API_BASE_URL, { session.token }, { session.expire() })
        setContent {
            MaterialTheme(colorScheme = Tokens.Colors) { App(session) }
        }
    }
}

// 화면 전환: 세션 확인 → 로그인(NW-01)·가입(NW-02) → 홈(NW-16) → AR 화면
@Composable
private fun App(session: Session) {
    val scope = rememberCoroutineScope()
    var signingUp by remember { mutableStateOf(false) }
    var inAr by remember { mutableStateOf(false) }
    val homeData = remember(session.user?.id) { HomeData() } // 로그인한 사용자가 바뀌면 비운다
    var navTarget by remember { mutableStateOf<MapPin?>(null) } // 지도에서 고른 AR 길찾기 목표
    var backToMap by remember { mutableStateOf(false) } // AR 길찾기에서 "지도로"를 눌러 돌아왔는지
    LaunchedEffect(Unit) { session.restore() }

    val user = session.user
    when {
        !session.checked -> Box(Modifier.fillMaxSize().background(Tokens.Bg), contentAlignment = Alignment.Center) {
            Text("DROP", color = Tokens.Gold300)
        }
        user == null -> if (signingUp) {
            SignupScreen(session, onBack = { signingUp = false })
        } else {
            LoginScreen(session, onSignup = { signingUp = true })
        }
        else -> Box(Modifier.fillMaxSize()) {
            if (inAr) {
                BackHandler { backToMap = false; inAr = false }
                SpikeScreen(session.api, navTarget, onHome = { backToMap = false; inAr = false }, onMap = { backToMap = true; inAr = false })
            } else {
                Home(session.api, user.email, homeData, startOnMap = backToMap, onOpenAr = { navTarget = it; inAr = true }, onLogout = { scope.launch { session.logout() } })
            }
            // 로그인 직후: 홈 위에 인트로 영상을 겹쳐 놓고, 영상이 투명해지면서 홈이 드러난다
            if (session.intro) IntroScreen(onDone = { session.endIntro() })
        }
    }
}
