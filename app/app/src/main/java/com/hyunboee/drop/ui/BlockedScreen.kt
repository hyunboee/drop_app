package com.hyunboee.drop.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hyunboee.drop.api.ApiClient
import com.hyunboee.drop.api.ApiException
import kotlinx.coroutines.launch

private class Blocked(val userId: String, val label: String)

// 내가 차단한 사람 목록. 이메일은 일부만 보이고, 차단을 풀면 그 사람의 캡슐이 다시 보인다
@Composable
fun BlockedScreen(api: ApiClient, onBack: () -> Unit) {
    var list by remember { mutableStateOf<List<Blocked>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    BackHandler(onBack = onBack)
    LaunchedEffect(Unit) {
        try {
            val a = api.request("GET", "/api/blocks")!!.getJSONArray("blocks")
            list = List(a.length()) { Blocked(a.getJSONObject(it).getString("user_id"), a.getJSONObject(it).getString("label")) }
        } catch (e: ApiException) {
            error = e.message
        }
    }
    Column(Modifier.fillMaxSize().background(Tokens.HomeBg).safeDrawingPadding().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(Tokens.Space4)) {
        Spacer(Modifier.height(Tokens.Space2))
        TextLink("‹ 홈", onBack)
        Column {
            Text("차단 목록", color = Tokens.HomeText, fontSize = 24.sp, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium)
            Text("차단하면 그 사람의 캡슐이 나에게 보이지 않아요. 풀면 다시 보여요.", color = Tokens.HomeSub, fontSize = 12.sp)
        }
        error?.let { Text(it, style = Tokens.Caption, color = Tokens.Error) }
        val items = list
        if (items != null && items.isEmpty()) Text("차단한 사람이 없어요", color = Tokens.HomeSub, fontSize = 13.sp)
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Tokens.Space2)) {
            for (b in items.orEmpty()) {
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Tokens.Card).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(b.label, color = Tokens.HomeText, fontSize = 15.sp, modifier = Modifier.weight(1f))
                    TextLink("차단 풀기", {
                        scope.launch {
                            try {
                                api.request("DELETE", "/api/blocks/${b.userId}")
                                list = list?.filter { it.userId != b.userId }
                            } catch (e: ApiException) {
                                error = e.message
                            }
                        }
                    })
                }
            }
        }
    }
}
