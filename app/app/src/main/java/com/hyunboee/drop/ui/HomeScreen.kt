package com.hyunboee.drop.ui

import android.graphics.Bitmap
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.hyunboee.drop.NP_08_EXPIRING_SOON_DAYS
import com.hyunboee.drop.NP_09_HOME_ARCHIVE_PREVIEW
import com.hyunboee.drop.NP_09_HOME_MINE_PREVIEW
import com.hyunboee.drop.api.ApiClient
import com.hyunboee.drop.api.ApiException
import com.hyunboee.drop.ar.saveToGallery
import com.hyunboee.drop.lib.daysLeft
import com.hyunboee.drop.lib.displayName
import kotlinx.coroutines.launch
import org.json.JSONObject

internal class MyCapsule(val id: String, val title: String, val grade: String, val thumbUrl: String, val lat: Double, val lng: Double, val daysLeft: Int, val viewCount: Int)

internal class OpenedCapsule(val id: String, val title: String, val thumbUrl: String, val mediaUrl: String)

private fun JSONObject.items(): List<JSONObject> = getJSONArray("capsules").let { a -> List(a.length()) { a.getJSONObject(it) } }

private val CardShape = RoundedCornerShape(16.dp)
private val Pill = RoundedCornerShape(50)

// 불러온 목록. 홈·지도·AR 사이를 오가도 남도록 화면 밖(App)에서 들고 있고, 다시 불러오는 동안에도 이전 값을 보여 준다
class HomeData {
    internal var mine by mutableStateOf<List<MyCapsule>>(emptyList())
    internal var archive by mutableStateOf<List<OpenedCapsule>>(emptyList())
}

// NW-16 홈(관리 화면)과 NW-17 보관함. 로그인 뒤 첫 화면이며 여기서 AR 카메라로 들어간다
@Composable
fun Home(api: ApiClient, email: String, data: HomeData, onCheckUpdate: (() -> Unit)?, startOnMap: Boolean, onOpenAr: (MapPin?) -> Unit, onLogout: () -> Unit) {
    val mine = data.mine
    val archive = data.archive
    var error by remember { mutableStateOf<String?>(null) }
    var showArchive by remember { mutableStateOf(false) }
    var viewing by remember { mutableStateOf<OpenedCapsule?>(null) }
    var showMap by remember { mutableStateOf(startOnMap) }
    var deleting by remember { mutableStateOf<MyCapsule?>(null) } // 삭제 확인 창을 띄울 캡슐
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try {
            val now = System.currentTimeMillis()
            error = null
            data.mine = api.request("GET", "/api/capsules/mine")!!.items().map {
                MyCapsule(it.getString("id"), it.getString("title"), it.getString("grade"), it.getString("thumb_url"), it.getDouble("lat"), it.getDouble("lng"), daysLeft(it.getString("expires_at"), now), it.getInt("view_count"))
            }
            data.archive = api.request("GET", "/api/capsules/archive")!!.items().map {
                OpenedCapsule(it.getString("id"), it.getString("title"), it.getString("thumb_url"), it.getString("media_url"))
            }
        } catch (e: ApiException) {
            error = e.message
        }
    }

    // 삭제 확인 → 서버에서 지우고(주인만 가능) 목록에서 뺀다. 사진도 함께 지워지므로 보관함에서도 빠진다
    deleting?.let { c ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("'${c.title}' 캡슐을 삭제할까요?") },
            text = { Text("삭제하면 되돌릴 수 없어요") },
            confirmButton = {
                TextButton(onClick = {
                    deleting = null
                    scope.launch {
                        try {
                            api.request("DELETE", "/api/capsules/${c.id}")
                            data.mine = data.mine.filter { it.id != c.id }
                            data.archive = data.archive.filter { it.id != c.id }
                        } catch (e: ApiException) {
                            error = e.message
                        }
                    }
                }) { Text("삭제", color = Tokens.Error) }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("취소") } },
        )
    }

    val shown = viewing
    when {
        shown != null -> {
            BackHandler { viewing = null }
            Viewer(api, shown, onClose = { viewing = null })
        }
        showMap -> {
            BackHandler { showMap = false }
            MapScreen(mine.map { MapPin(it.id, it.title, it.lat, it.lng) }, onBack = { showMap = false }, onNavigate = { onOpenAr(it) })
        }
        showArchive -> {
            BackHandler { showArchive = false }
            ArchiveScreen(api, archive, onBack = { showArchive = false }, onView = { viewing = it })
        }
        else -> HomeScreen(api, email, mine, archive, error, { onOpenAr(null) }, onLogout, onCheckUpdate, onArchive = { showArchive = true }, onMap = { showMap = true }, onView = { viewing = it }, onDelete = { deleting = it })
    }
}

@Composable
private fun HomeScreen(
    api: ApiClient,
    email: String,
    mine: List<MyCapsule>,
    archive: List<OpenedCapsule>,
    error: String?,
    onOpenAr: () -> Unit,
    onLogout: () -> Unit,
    onCheckUpdate: (() -> Unit)?,
    onArchive: () -> Unit,
    onMap: () -> Unit,
    onView: (OpenedCapsule) -> Unit,
    onDelete: (MyCapsule) -> Unit,
) {
    var allMine by remember { mutableStateOf(false) }
    val name = displayName(email)

    Column(Modifier.fillMaxSize().background(Tokens.HomeBg).safeDrawingPadding()) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(Tokens.Space5),
        ) {
            // 왼쪽 위: 등급별 보유 캡슐 수, 오른쪽 위: 접속한 사용자
            Row(Modifier.fillMaxWidth().padding(top = Tokens.Space4), verticalAlignment = Alignment.CenterVertically) {
                GradeChip("브론즈", mine.count { it.grade == "BRONZE" }, Tokens.Bronze)
                Spacer(Modifier.width(Tokens.Space2))
                GradeChip("실버", mine.count { it.grade == "SILVER" }, Tokens.Silver)
                Spacer(Modifier.weight(1f))
                Text(name, color = Tokens.HomeText, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                Spacer(Modifier.width(Tokens.Space2))
                Box(Modifier.size(34.dp).clip(CircleShape).background(Tokens.BronzeBg), contentAlignment = Alignment.Center) {
                    Text(name.take(1).uppercase(), color = Tokens.Amber, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }

            Column {
                Text("DROP", color = Tokens.HomeSub, fontSize = 11.sp, letterSpacing = 0.2.em)
                Spacer(Modifier.height(Tokens.Space2))
                Text("그 자리에 가야만\n열리는 이야기", color = Tokens.HomeText, fontSize = 28.sp, lineHeight = 38.sp, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Stat("남긴 캡슐", mine.size, Tokens.HomeText)
                Stat("열어 본 캡슐", archive.size, Tokens.HomeText)
                Stat("곧 만료", mine.count { it.daysLeft <= NP_08_EXPIRING_SOON_DAYS }, Tokens.Amber)
            }

            error?.let { Text(it, style = Tokens.Caption, color = Tokens.Error) }

            Column(verticalArrangement = Arrangement.spacedBy(Tokens.Space2)) {
                SectionHead("내가 남긴 캡슐", if (mine.size > NP_09_HOME_MINE_PREVIEW) (if (allMine) "접기" else "전체 보기") else null) { allMine = !allMine }
                if (mine.isEmpty()) Empty("아직 남긴 캡슐이 없어요")
                for (c in if (allMine) mine else mine.take(NP_09_HOME_MINE_PREVIEW)) MineRow(api, c) { onDelete(c) }
            }

            Column(verticalArrangement = Arrangement.spacedBy(Tokens.Space2)) {
                SectionHead("보관함", if (archive.size > NP_09_HOME_ARCHIVE_PREVIEW) "전체 보기" else null, onArchive)
                Text("열어 본 사진을 모아 두고 저장할 수 있어요", color = Tokens.HomeSub, fontSize = 12.sp)
                Spacer(Modifier.height(Tokens.Space1))
                if (archive.isEmpty()) Empty("아직 열어 본 캡슐이 없어요")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    val preview = archive.take(NP_09_HOME_ARCHIVE_PREVIEW)
                    for (c in preview) ArchiveTile(api, c, Modifier.weight(1f)) { onView(c) }
                    repeat(NP_09_HOME_ARCHIVE_PREVIEW - preview.size) { Spacer(Modifier.weight(1f)) }
                }
            }

            Column(Modifier.fillMaxWidth().padding(bottom = Tokens.Space4), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Tokens.Space2)) {
                if (onCheckUpdate != null) TextLink("업데이트 확인 · 현재 v${com.hyunboee.drop.BuildConfig.VERSION_NAME}", onCheckUpdate)
                TextLink("로그아웃", onLogout)
            }
        }

        // 화면 아래에 고정된 동작: 지도(보조)와 AR 카메라(주요)
        Row(Modifier.padding(horizontal = 20.dp, vertical = Tokens.Space3), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(
                Modifier.weight(1f).height(56.dp).clip(CardShape).border(1.dp, Tokens.Amber, CardShape).clickable(onClick = onMap),
                contentAlignment = Alignment.Center,
            ) {
                Text("지도", color = Tokens.Amber, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
            Box(
                Modifier.weight(2f).height(56.dp).clip(CardShape).background(Tokens.Amber).clickable(onClick = onOpenAr),
                contentAlignment = Alignment.Center,
            ) {
                Text("AR 카메라 열기", color = Tokens.TextOnGold, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun GradeChip(label: String, count: Int, dot: Color) {
    Row(Modifier.clip(Pill).background(Tokens.Chip).padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(9.dp).clip(CircleShape).background(dot))
        Spacer(Modifier.width(6.dp))
        Text("$label $count", color = Tokens.HomeText, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun RowScope.Stat(label: String, value: Int, color: Color) {
    Column(Modifier.weight(1f).clip(CardShape).background(Tokens.Card).border(1.dp, Tokens.CardLine, CardShape).padding(14.dp)) {
        Text(label, color = Tokens.HomeSub, fontSize = 12.sp)
        Spacer(Modifier.height(Tokens.Space2))
        Text("$value", color = color, fontSize = 28.sp, fontFamily = FontFamily.Serif)
    }
}

@Composable
private fun SectionHead(title: String, action: String?, onAction: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = Tokens.HomeText, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        if (action != null) Text(action, color = Tokens.Amber, fontSize = 13.sp, modifier = Modifier.clickable(onClick = onAction).padding(Tokens.Space1))
    }
}

@Composable
private fun Empty(text: String) {
    Text(text, color = Tokens.HomeSub, fontSize = 13.sp, modifier = Modifier.fillMaxWidth().clip(CardShape).background(Tokens.Card).padding(Tokens.Space4))
}

@Composable
private fun MineRow(api: ApiClient, c: MyCapsule, onDelete: () -> Unit) {
    val silver = c.grade != "BRONZE"
    Row(Modifier.fillMaxWidth().clip(CardShape).background(Tokens.Card).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
        RemoteImage(api, c.thumbUrl, Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)))
        Spacer(Modifier.width(Tokens.Space3))
        Column(Modifier.weight(1f)) {
            Text(c.title, color = Tokens.HomeText, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("열람 ${c.viewCount}회", color = Tokens.HomeSub, fontSize = 12.sp)
        }
        Spacer(Modifier.width(Tokens.Space2))
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(Tokens.Space2)) {
        Text(
            "${if (silver) "실버" else "브론즈"} D-${c.daysLeft}",
            color = if (silver) Tokens.Silver else Tokens.Amber,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.clip(Pill).background(if (silver) Tokens.SilverBg else Tokens.BronzeBg).padding(horizontal = 10.dp, vertical = 6.dp),
        )
        TextLink("삭제", onDelete, danger = true)
        }
    }
}

@Composable
private fun ArchiveTile(api: ApiClient, c: OpenedCapsule, modifier: Modifier, onClick: () -> Unit) {
    Column(modifier.clickable(onClick = onClick)) {
        RemoteImage(api, c.thumbUrl, Modifier.fillMaxWidth().aspectRatio(1f).clip(CardShape))
        Spacer(Modifier.height(Tokens.Space2))
        Text(c.title, color = Tokens.HomeText, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// 미디어 프록시에서 받은 사진. 받는 동안과 실패했을 때는 빈 카드색
@Composable
private fun RemoteImage(api: ApiClient, path: String, modifier: Modifier, crop: Boolean = true, onLoaded: (Bitmap) -> Unit = {}) {
    val bitmap by produceState<Bitmap?>(null, path) { value = api.bitmap(path)?.also(onLoaded) }
    Box(modifier.background(Tokens.CardLine)) {
        bitmap?.let { Image(it.asImageBitmap(), contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = if (crop) ContentScale.Crop else ContentScale.Fit) }
    }
}

// NW-17 보관함: 열어 본 캡슐의 사진을 3열로 모아 본다
@Composable
private fun ArchiveScreen(api: ApiClient, archive: List<OpenedCapsule>, onBack: () -> Unit, onView: (OpenedCapsule) -> Unit) {
    Column(
        Modifier.fillMaxSize().background(Tokens.HomeBg).safeDrawingPadding().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(Tokens.Space4),
    ) {
        Box(Modifier.padding(top = Tokens.Space4)) { TextLink("‹ 홈", onBack) }
        Column {
            Text("보관함", color = Tokens.HomeText, fontSize = 24.sp, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium)
            Text("열어 본 사진 ${archive.size}장 · 사진을 누르면 크게 보고 저장할 수 있어요", color = Tokens.HomeSub, fontSize = 12.sp)
        }
        if (archive.isEmpty()) Empty("아직 열어 본 캡슐이 없어요")
        // ponytail: 전부 한 번에 그린다. 수백 장이 되면 LazyVerticalGrid로 바꾼다
        for (row in archive.chunked(3)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for (c in row) ArchiveTile(api, c, Modifier.weight(1f)) { onView(c) }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
        Spacer(Modifier.height(Tokens.Space4))
    }
}

// 보관함 사진 크게 보기 + 갤러리에 저장
@Composable
private fun Viewer(api: ApiClient, c: OpenedCapsule, onClose: () -> Unit) {
    val context = LocalContext.current
    var original by remember { mutableStateOf<Bitmap?>(null) }
    Column(Modifier.fillMaxSize().background(Tokens.HomeBg).safeDrawingPadding().padding(horizontal = 20.dp)) {
        Row(Modifier.fillMaxWidth().padding(vertical = Tokens.Space4), verticalAlignment = Alignment.CenterVertically) {
            TextLink("‹ 닫기", onClose)
            Spacer(Modifier.width(Tokens.Space4))
            Text(c.title, color = Tokens.HomeText, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        RemoteImage(api, c.mediaUrl, Modifier.weight(1f).fillMaxWidth().clip(CardShape), crop = false) { original = it }
        Box(
            Modifier
                .padding(vertical = Tokens.Space3)
                .fillMaxWidth()
                .height(56.dp)
                .clip(CardShape)
                .background(Tokens.Amber.copy(alpha = if (original != null) 1f else 0.4f))
                .clickable(enabled = original != null) {
                    val ok = original?.let { saveToGallery(context, it) } == true
                    Toast.makeText(context, if (ok) "갤러리에 저장했어요" else "저장하지 못했어요", Toast.LENGTH_SHORT).show()
                },
            contentAlignment = Alignment.Center,
        ) {
            Text("사진 저장", color = Tokens.TextOnGold, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
    }
}
