package com.hyunboee.drop

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import android.widget.Toast
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.hyunboee.drop.api.ApiClient
import com.hyunboee.drop.api.ApiException
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
import com.hyunboee.drop.update.Updater
import com.hyunboee.drop.update.UpdateInfo
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

    // 앱 자체 업데이트(밖 앱만): 켤 때 한 번 새 버전을 확인하고, 홈의 "업데이트 확인"으로 직접 확인한다
    val context = LocalContext.current
    val updater = remember { Updater(context, session.api) }
    var update by remember { mutableStateOf<UpdateInfo?>(null) }
    var progress by remember { mutableStateOf<Int?>(null) } // 받는 중이면 0~100
    val checkUpdate: (Boolean) -> Unit = { manual ->
        scope.launch {
            val info = updater.latest()
            when {
                info != null && updater.isNewer(info) -> update = info
                manual -> Toast.makeText(context, if (info == null) "업데이트를 확인하지 못했어요" else "최신 버전이에요", Toast.LENGTH_SHORT).show()
            }
        }
    }
    LaunchedEffect(Unit) { if (BuildConfig.IN_APP_UPDATE) checkUpdate(false) }

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
                Home(session.api, user.email, homeData, onCheckUpdate = if (BuildConfig.IN_APP_UPDATE) ({ checkUpdate(true) }) else null, startOnMap = backToMap, onOpenAr = { navTarget = it; inAr = true }, onLogout = { scope.launch { session.logout() } })
            }
            // 로그인 직후: 홈 위에 인트로 영상을 겹쳐 놓고, 영상이 투명해지면서 홈이 드러난다
            if (session.intro) IntroScreen(onDone = { session.endIntro() })
        }
    }

    update?.let { info ->
        AlertDialog(
            onDismissRequest = { if (progress == null) update = null },
            title = { Text("새 버전이 있어요 (v${info.versionName})") },
            text = {
                Text(
                    when {
                        progress != null -> "내려받는 중… ${progress}%"
                        else -> (info.notes.ifBlank { "새 기능과 수정이 들어 있어요" }) + "\n\n업데이트하면 설치 화면이 열려요. 설치를 눌러 주세요."
                    },
                )
            },
            confirmButton = {
                TextButton(
                    enabled = progress == null,
                    onClick = {
                        if (!updater.canInstall()) {
                            // 이 앱이 설치를 요청할 수 있게 한 번 허용해야 한다
                            Toast.makeText(context, "'이 출처 허용'을 켜고 돌아와 다시 눌러 주세요", Toast.LENGTH_LONG).show()
                            updater.openInstallSettings()
                        } else {
                            progress = 0
                            scope.launch {
                                try {
                                    val apk = updater.download(info) { progress = it }
                                    update = null
                                    updater.install(apk)
                                } catch (e: ApiException) {
                                    Toast.makeText(context, e.message ?: "업데이트에 실패했어요", Toast.LENGTH_LONG).show()
                                } finally {
                                    progress = null
                                }
                            }
                        }
                    },
                ) { Text("지금 업데이트") }
            },
            dismissButton = { TextButton(enabled = progress == null, onClick = { update = null }) { Text("나중에") } },
        )
    }
}
