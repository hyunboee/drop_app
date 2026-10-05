package com.hyunboee.drop.ar

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hyunboee.drop.api.ApiClient
import com.hyunboee.drop.ui.MapPin
import com.hyunboee.drop.ui.Tokens

private const val GOOGLE_NOTICE_URL = "https://support.google.com/ar?p=how-google-play-services-for-ar-handles-your-data"

// AR를 처음 켤 때 한 번, 구글이 요구하는 안내(주변 센서 데이터를 구글이 처리한다)를 보여 주고 동의를 받는다.
// 동의하기 전에는 AR 화면(카메라)을 시작하지 않는다. 동의는 이 기기에 기억해 다시 묻지 않는다
@Composable
fun ArGate(api: ApiClient, navTarget: MapPin?, onHome: () -> Unit, onMap: () -> Unit) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("ar", Context.MODE_PRIVATE) }
    var accepted by remember { mutableStateOf(prefs.getBoolean("google_notice_ok", false)) }
    if (accepted) {
        ArScreen(api, navTarget, onHome, onMap)
        return
    }
    Column(Modifier.fillMaxSize().background(Tokens.Bg)) {}
    AlertDialog(
        onDismissRequest = onHome,
        title = { Text("AR 기능 안내") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("To power this session, Google will process sensor data (e.g., camera and location).", fontSize = 14.sp)
                Text("AR로 캡슐을 같은 자리에 두려면 카메라 영상에서 뽑은 주변 공간 정보와 위치가 Google에 전송되어 처리돼요. 자세한 내용은 개인정보 처리방침에서도 볼 수 있어요.", fontSize = 13.sp)
                TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(GOOGLE_NOTICE_URL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }) {
                    Text("Google의 안내 자세히 알아보기")
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                prefs.edit().putBoolean("google_notice_ok", true).apply()
                accepted = true
            }) { Text("동의하고 시작") }
        },
        dismissButton = { TextButton(onClick = onHome) { Text("돌아가기") } },
    )
}
