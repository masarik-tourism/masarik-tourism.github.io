# Proguard rules for Masarik Tourism Android App
-keepattributes *Annotation*,JavascriptInterface
-keep class com.masarik.tourism.AndroidBridge { *; }
-keep class com.masarik.tourism.MasarikFirebaseMessagingService { *; }
-keep class com.masarik.tourism.MasarikNotificationHelper { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-dontwarn java.lang.invoke.**
