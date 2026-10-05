package com.hyunboee.drop.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.hyunboee.drop.R

// docs/9-style-guide.md 3~4장의 화면 틀과 컴포넌트. 웹(frontend/src/components)과 같은 모양이다.

// 사진 배경 화면 틀 (3장): 흙 속 타임캡슐 사진을 꽉 채우고 --gradient-read를 얹는다.
// 위에는 워드마크 블록, 아래에는 내용이 놓인다. 시스템 표시줄·키보드와 겹치지 않게 안전 영역 안쪽에 둔다
@Composable
fun PhotoScreen(wordmark: Boolean = true, top: @Composable () -> Unit = {}, content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().background(Tokens.Bg)) {
        Image(painterResource(R.drawable.bg_soil), contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Tokens.GradientRead))
        BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
            Column(
                Modifier
                    .verticalScroll(rememberScrollState())
                    .heightIn(min = maxHeight) // 내용이 짧으면 아래로 붙도록 화면 높이만큼은 차지한다
                    .fillMaxWidth()
                    .padding(Tokens.Gutter),
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(Modifier.fillMaxWidth().padding(top = Tokens.Space6), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (wordmark) {
                        Text("DROP", style = Tokens.Display, textAlign = TextAlign.Center)
                        Spacer(Modifier.height(Tokens.Space4))
                        Text("그 자리에 묻어 둔 기억", style = Tokens.Tagline, color = Tokens.TextSub, textAlign = TextAlign.Center)
                    }
                }
                Column(Modifier.fillMaxWidth().padding(top = Tokens.Space7), verticalArrangement = Arrangement.spacedBy(Tokens.Space5), content = content)
            }
            // 화면 왼쪽 위에 놓는 요소 (가입 화면의 "‹ 로그인")
            Box(Modifier.padding(start = Tokens.Gutter, top = Tokens.Space5)) { top() }
        }
    }
}

// 밑줄 입력란 (4.2): 상자 없이 라벨 → 입력값 → 밑줄. 포커스 시 밑줄이 금색 2px
@Composable
fun UnderlineInput(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String = "",
    password: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    error: String? = null,
) {
    var focused by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        Text(label, style = Tokens.Label, color = Tokens.TextSub)
        Spacer(Modifier.height(Tokens.Space2))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = Tokens.Body.copy(color = Tokens.Text),
            cursorBrush = SolidColor(Tokens.Gold300),
            visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty()) Text(placeholder, style = Tokens.Body, color = Tokens.TextMuted)
                    inner()
                }
            },
        )
        Spacer(Modifier.height(Tokens.Space2))
        // 밑줄 두께가 바뀌어도 아래 요소가 밀리지 않게 2dp 자리를 잡아 둔다
        Box(Modifier.fillMaxWidth().height(2.dp)) {
            Box(Modifier.fillMaxWidth().height(if (focused) 2.dp else 1.dp).background(if (focused) Tokens.Gold300 else Tokens.Line))
        }
        if (error != null) {
            Spacer(Modifier.height(Tokens.Space3))
            Text(error, style = Tokens.Caption, color = Tokens.Error)
        }
    }
}

// 주요 버튼 (4.1): 높이 50, 금색 그라데이션 채움, 각진 모서리. 한 화면에 하나만 둔다
@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, enabled: Boolean = true, loading: Boolean = false) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val active = enabled && !loading
    Box(
        Modifier
            .fillMaxWidth()
            .height(50.dp)
            .alpha(if (active) 1f else 0.4f)
            .background(Tokens.GradientGold)
            .clickable(interactionSource = source, indication = null, enabled = active, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        // 누름: brightness(0.92)
        if (pressed) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.08f)))
        if (loading) {
            Dots()
        } else {
            // 자간 0.6em만큼 오른쪽으로 치우치므로 왼쪽에 같은 만큼 들여 가운데를 맞춘다
            Text(text, style = Tokens.Button, color = Tokens.TextOnGold, modifier = Modifier.padding(start = 8.dp))
        }
    }
}

// 보조 버튼 (4.1): 주요 버튼과 같은 크기, 바탕 없이 금색 테두리 1px
@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, enabled: Boolean = true) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(50.dp)
            .alpha(if (enabled) 1f else 0.4f)
            .border(1.dp, Tokens.Gold500)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = Tokens.Button.copy(letterSpacing = 0.1.em), color = Tokens.Gold300)
    }
}

// 전송 중 표시: 점 세 개가 차례로 깜빡인다
@Composable
private fun Dots() {
    val phase by rememberInfiniteTransition(label = "dots").animateFloat(
        initialValue = 0f,
        targetValue = 3f,
        animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Restart),
        label = "phase",
    )
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        for (i in 0 until 3) {
            Box(Modifier.size(5.dp).alpha(if (phase.toInt() == i) 1f else 0.3f).background(Tokens.TextOnGold))
        }
    }
}

// 텍스트 버튼 (4.1): 글자만, 밑줄. 되돌릴 수 없는 동작은 danger
@Composable
fun TextLink(text: String, onClick: () -> Unit, danger: Boolean = false) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Text(
        text,
        style = Tokens.Link,
        color = if (danger) Tokens.Error else Tokens.Text,
        modifier = Modifier
            .alpha(if (pressed) 0.7f else 1f)
            .clickable(interactionSource = source, indication = null, onClick = onClick),
    )
}

// 체크박스 (4.2): 16px 정사각형, 금색 테두리, 체크하면 금색 채움. 오른쪽 끝에 "전문 보기"
@Composable
fun DropCheckbox(label: String, checked: Boolean, onChange: (Boolean) -> Unit, onViewTerms: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Row(
            Modifier
                .weight(1f)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { onChange(!checked) }
                .padding(vertical = Tokens.Space1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(16.dp)
                    .background(if (checked) Tokens.Gold500 else Color.Transparent)
                    .border(1.dp, Tokens.Gold500),
                contentAlignment = Alignment.Center,
            ) {
                if (checked) {
                    Canvas(Modifier.size(10.dp)) {
                        val w = size.width
                        val h = size.height
                        drawLine(Tokens.TextOnGold, Offset(w * 0.10f, h * 0.55f), Offset(w * 0.40f, h * 0.85f), strokeWidth = 2.dp.toPx(), cap = StrokeCap.Square)
                        drawLine(Tokens.TextOnGold, Offset(w * 0.40f, h * 0.85f), Offset(w * 0.92f, h * 0.15f), strokeWidth = 2.dp.toPx(), cap = StrokeCap.Square)
                    }
                }
            }
            Spacer(Modifier.size(Tokens.Space2))
            Text(label, style = Tokens.Caption, color = Tokens.TextSub)
        }
        if (onViewTerms != null) {
            Spacer(Modifier.size(Tokens.Space3))
            TextLink("전문 보기", onViewTerms)
        }
    }
}
