package com.hyunboee.drop.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hyunboee.drop.api.ApiClient
import com.hyunboee.drop.api.ApiException

// 이용약관(terms), 개인정보 처리방침(privacy), 위치정보 이용약관(location). 원문은 서버(backend/legal)에 있고
// 로그인 전에도 받을 수 있다. 약관을 고쳐도 앱을 다시 만들지 않아도 된다
@Composable
fun LegalScreen(api: ApiClient, doc: String, onBack: () -> Unit) {
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    BackHandler(onBack = onBack)
    LaunchedEffect(doc) {
        try {
            val j = api.request("GET", "/api/legal/$doc")!!
            title = j.getString("title")
            body = j.getString("body")
        } catch (e: ApiException) {
            error = e.message
        }
    }
    Column(Modifier.fillMaxSize().background(Tokens.HomeBg).safeDrawingPadding().padding(horizontal = 20.dp)) {
        Spacer(Modifier.height(Tokens.Space4))
        TextLink("‹ 닫기", onBack)
        Spacer(Modifier.height(Tokens.Space4))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            if (title.isNotEmpty()) Text(title, color = Tokens.HomeText, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(Tokens.Space3))
            Text(body ?: error ?: "불러오는 중…", color = if (error != null) Tokens.Error else Tokens.HomeSub, fontSize = 13.sp, lineHeight = 21.sp)
            Spacer(Modifier.height(Tokens.Space6))
        }
    }
}
