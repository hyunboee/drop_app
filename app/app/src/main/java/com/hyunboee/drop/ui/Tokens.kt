package com.hyunboee.drop.ui

import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

// docs/9-style-guide.md 2장의 토큰을 옮긴 것. 색·간격·글자 모양은 여기에서만 정한다.
// 이름은 CSS 변수와 같게 지었다 (예: --color-gold-300 → Gold300).
object Tokens {
    // 2.1 색상
    val Bg = Color(0xFF0B0907)
    val Surface = Color(0xDB120E0A) // rgba(18,14,10,0.86)
    val Scrim = Color(0x8C05040A) // rgba(5,4,10,0.55)
    val Text = Color(0xFFE9E0CC)
    val TextSub = Color(0xFFC8B791)
    val TextMuted = Color(0xFF8D7F66)
    val TextOnGold = Color(0xFF2B2213)
    val Gold100 = Color(0xFFF3DF9F)
    val Gold300 = Color(0xFFE9D39A)
    val Gold500 = Color(0xFFC9A24F)
    val Gold700 = Color(0xFF8A6A2C)
    val Line = Color(0xFFA8905F)
    val LineSubtle = Color(0x3DC8B791) // rgba(200,183,145,0.24)
    val Error = Color(0xFFE3A089)

    // 홈·보관함 (스타일 가이드 4.7)
    val HomeBg = Color(0xFF17130F)
    val Card = Color(0xFF201B16)
    val CardLine = Color(0xFF2E2720)
    val Chip = Color(0xFF2A231C)
    val Amber = Color(0xFFE2A346)
    val HomeText = Color(0xFFF3EDE2)
    val HomeSub = Color(0xFF9A9084)
    val Bronze = Color(0xFFC98A4B)
    val BronzeBg = Color(0xFF3A2A16)
    val Silver = Color(0xFFC9CDD6)
    val SilverBg = Color(0xFF2B303A)

    // --gradient-gold: 주요 버튼 채움 (왼쪽 → 오른쪽)
    val GradientGold = Brush.horizontalGradient(
        0f to Color(0xFFB8924A),
        0.35f to Color(0xFFE9D39A),
        0.60f to Color(0xFFD1B06B),
        1f to Color(0xFFA07C38),
    )

    // --gradient-gold-text: 워드마크 글자 (위 → 아래)
    val GradientGoldText = Brush.verticalGradient(0f to Gold100, 0.5f to Gold500, 1f to Gold700)

    // --gradient-read: 배경 사진 위 글자 가독성 (아주 옅게)
    val GradientRead = Brush.verticalGradient(
        0f to Color(0x2905040A),
        0.26f to Color(0x0005040A),
        0.64f to Color(0x0005040A),
        1f to Color(0x3305040A),
    )

    // 2.2 간격
    val Space1 = 4.dp
    val Space2 = 8.dp
    val Space3 = 12.dp
    val Space4 = 16.dp
    val Space5 = 24.dp
    val Space6 = 32.dp
    val Space7 = 48.dp
    val Gutter = 40.dp

    // 2.3 타이포그래피. 서체 파일을 넣지 않고 기기 기본 서체만 쓴다
    val Display = TextStyle(fontFamily = FontFamily.Serif, fontSize = 40.sp, fontWeight = FontWeight.Normal, letterSpacing = 0.42.em, lineHeight = 40.sp, brush = GradientGoldText)
    val Tagline = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Normal, letterSpacing = 0.42.em, lineHeight = 1.4.em)
    val Title = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.02.em, lineHeight = 1.4.em)
    val Body = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Normal, lineHeight = 1.5.em)
    val Label = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.04.em, lineHeight = 1.4.em)
    val Caption = TextStyle(fontSize = 11.5.sp, fontWeight = FontWeight.Normal, lineHeight = 1.5.em)
    val Button = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.6.em, lineHeight = 14.sp)
    val Link = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium, lineHeight = 1.4.em, textDecoration = TextDecoration.Underline)

    // 실험 화면처럼 Material 기본 컴포넌트를 쓰는 곳의 색
    val Colors = darkColorScheme(
        primary = Gold300,
        onPrimary = TextOnGold,
        background = Bg,
        onBackground = Text,
        surface = Bg,
        onSurface = Text,
        error = Error,
    )
}
