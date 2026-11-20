package com.masarik.tourism

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

data class PushNavigationPayload(
    val role: String,
    val action: String,
    val phone: String,
    val nonce: Long = System.currentTimeMillis()
)

internal object MasarikNotificationHelper {
    const val CHANNEL_ID = "masarik_alerts"
    const val EXTRA_PUSH_ROLE = "push_role"
    const val EXTRA_PUSH_ACTION = "push_action"
    const val EXTRA_PUSH_PHONE = "push_phone"
    const val ACTION_FCM_TOKEN_UPDATED = "com.masarik.tourism.FCM_TOKEN_UPDATED"
    const val EXTRA_FCM_TOKEN = "fcm_token"

    private const val PREFS_NAME = "masarik_fcm_prefs"
    private const val KEY_FCM_TOKEN = "fcm_token"

    fun saveFcmToken(context: Context, token: String) {
        val clean = token.trim()
        if (clean.isEmpty()) return
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_FCM_TOKEN, clean)
            .apply()
    }

    fun getSavedFcmToken(context: Context): String {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_FCM_TOKEN, "")
            ?.trim()
            .orEmpty()
    }

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                    ?: return
            val existing = manager.getNotificationChannel(CHANNEL_ID)
            if (existing != null) return

            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            val channel = NotificationChannel(
                CHANNEL_ID,
                "إشعارات مسارك للسياحة",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "تنبيهات المحادثات الفورية وتحديثات الطلبات والمستندات"
                enableLights(true)
                lightColor = android.graphics.Color.parseColor("#C6A052")
                enableVibration(true)
                vibrationPattern = longArrayOf(0L, 250L, 120L, 250L)
                setSound(soundUri, audioAttributes)
                setShowBadge(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(channel)
        }
    }

    fun hasPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return false
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    fun showNotification(
        context: Context,
        title: String,
        body: String,
        role: String = "client",
        action: String = "chat",
        phone: String = ""
    ) {
        ensureChannel(context)
        if (!hasPermission(context)) return

        val safeRole = role.ifBlank { "client" }
        val safeAction = action.ifBlank { if (safeRole == "admin") "live_chat" else "chat" }
        val safeTitle = title.ifBlank { "مسارك للإنجاز السياحي" }
        val safeBody = body.ifBlank { "لديك رسالة أو تحديث جديد." }

        val tapIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_PUSH_ROLE, safeRole)
            putExtra(EXTRA_PUSH_ACTION, safeAction)
            if (phone.isNotBlank()) {
                putExtra(EXTRA_PUSH_PHONE, phone)
            }
        }

        val notificationId = (System.currentTimeMillis() and 0x7FFFFFFF).toInt()
        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val largeIconBitmap = try {
            BitmapFactory.decodeResource(context.resources, R.drawable.masarik_logo)
        } catch (_: Exception) {
            null
        }

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setColor(android.graphics.Color.parseColor("#0F2438"))
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setStyle(NotificationCompat.BigTextStyle().bigText(safeBody))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0L, 250L, 120L, 250L))
            .setDefaults(
                NotificationCompat.DEFAULT_LIGHTS or
                    NotificationCompat.DEFAULT_SOUND or
                    NotificationCompat.DEFAULT_VIBRATE
            )
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        if (largeIconBitmap != null) {
            builder.setLargeIcon(largeIconBitmap)
        }

        val manager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        try {
            if (manager != null) {
                manager.notify(notificationId, builder.build())
            } else {
                NotificationManagerCompat.from(context).notify(notificationId, builder.build())
            }
        } catch (_: SecurityException) {
        }
    }

    fun extractPushPayload(intent: Intent?): PushNavigationPayload? {
        intent ?: return null
        val role = (intent.getStringExtra(EXTRA_PUSH_ROLE)
            ?: intent.getStringExtra("role"))?.trim().orEmpty()
        val action = (intent.getStringExtra(EXTRA_PUSH_ACTION)
            ?: intent.getStringExtra("action"))?.trim().orEmpty()
        val phone = (intent.getStringExtra(EXTRA_PUSH_PHONE)
            ?: intent.getStringExtra("phone"))?.trim().orEmpty()
        if (role.isEmpty() && action.isEmpty()) return null
        return PushNavigationPayload(
            role = role.ifEmpty { "client" },
            action = action.ifEmpty { if (role == "admin") "live_chat" else "chat" },
            phone = phone
        )
    }
}
