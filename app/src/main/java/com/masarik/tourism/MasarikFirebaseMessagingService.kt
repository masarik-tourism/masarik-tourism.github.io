package com.masarik.tourism

import android.content.Intent
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MasarikFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val cleanToken = token.trim()
        if (cleanToken.isEmpty()) return

        MasarikNotificationHelper.saveFcmToken(applicationContext, cleanToken)
        val updateIntent = Intent(MasarikNotificationHelper.ACTION_FCM_TOKEN_UPDATED).apply {
            setPackage(packageName)
            putExtra(MasarikNotificationHelper.EXTRA_FCM_TOKEN, cleanToken)
        }
        sendBroadcast(updateIntent)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        val data = remoteMessage.data
        val notif = remoteMessage.notification

        val title = (notif?.title ?: data["title"] ?: "مسارك للإنجاز السياحي").trim()
        val body = (notif?.body ?: data["body"] ?: "لديك رسالة أو تحديث جديد.").trim()
        val role = (data["role"] ?: "client").trim()
        val action = (data["action"] ?: if (role == "admin") "live_chat" else "chat").trim()
        val phone = (data["phone"] ?: "").trim()

        MasarikNotificationHelper.showNotification(
            context = applicationContext,
            title = title,
            body = body,
            role = role,
            action = action,
            phone = phone
        )
    }
}
