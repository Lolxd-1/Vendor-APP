package com.quickverse.vendor

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * The order alarm. Loops the ring on the ALARM stream at full volume (so it plays on
 * Silent/Vibrate) until stop() — nothing else stops it. All state is touched on the main
 * thread only, so start/stop/test can never interleave.
 */
object Ringer {
  private const val TAG = "QVRinger"
  private const val TEST_MS = 2_000L
  private val VIBRATION = longArrayOf(0, 800, 600)
  private val ALARM_ATTRS: AudioAttributes =
      AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()

  private val main = Handler(Looper.getMainLooper())
  private var ringPlayer: MediaPlayer? = null
  private var testPlayer: MediaPlayer? = null
  private var savedAlarmVolume: Int? = null
  private var focusRequest: AudioFocusRequest? = null
  private var appContext: Context? = null
  private val endTest = Runnable { stopTestPlayer() }

  fun start(context: Context) {
    val app = context.applicationContext
    appContext = app
    main.post { startOnMain(app) }
  }

  fun stop(context: Context) {
    val app = context.applicationContext
    appContext = app
    main.post { stopOnMain(app) }
  }

  fun playTest(context: Context) {
    val app = context.applicationContext
    appContext = app
    main.post { testOnMain(app) }
  }

  private fun startOnMain(context: Context) {
    // A real order always wins over the test beep.
    main.removeCallbacks(endTest)
    stopTestPlayer()
    if (ringPlayer != null) return
    val audio = context.getSystemService(AudioManager::class.java)
    raiseAlarmVolume(audio)
    requestFocus(audio)
    ringPlayer = createPlayer(context, looping = true)?.also { it.start() }
    if (ringPlayer == null) Log.e(TAG, "no playable ring sound")
    vibrate(context)
  }

  private fun stopOnMain(context: Context) {
    ringPlayer?.let { release(it) }
    ringPlayer = null
    vibrator(context)?.cancel()
    abandonFocus(context.getSystemService(AudioManager::class.java))
    if (testPlayer == null) restoreAlarmVolume()
  }

  private fun testOnMain(context: Context) {
    if (ringPlayer != null || testPlayer != null) return
    raiseAlarmVolume(context.getSystemService(AudioManager::class.java))
    testPlayer = createPlayer(context, looping = false)?.also { it.start() }
    main.postDelayed(endTest, TEST_MS)
  }

  private fun stopTestPlayer() {
    testPlayer?.let { release(it) }
    testPlayer = null
    if (ringPlayer == null) restoreAlarmVolume()
  }

  // Bundled bell first; the system alarm tone if that ever fails — never silence.
  private fun createPlayer(context: Context, looping: Boolean): MediaPlayer? {
    val bundled =
        try {
          MediaPlayer().apply {
            setAudioAttributes(ALARM_ATTRS)
            context.resources.openRawResourceFd(R.raw.order_ring).use {
              setDataSource(it.fileDescriptor, it.startOffset, it.length)
            }
            isLooping = looping
            prepare()
          }
        } catch (e: Exception) {
          Log.e(TAG, "bundled ring failed", e)
          null
        }
    if (bundled != null) return bundled
    return try {
      val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: return null
      MediaPlayer().apply {
        setAudioAttributes(ALARM_ATTRS)
        setDataSource(context, uri)
        isLooping = looping
        prepare()
      }
    } catch (e: Exception) {
      Log.e(TAG, "fallback alarm tone failed", e)
      null
    }
  }

  private fun release(player: MediaPlayer) {
    try {
      if (player.isPlaying) player.stop()
    } catch (_: IllegalStateException) {}
    player.release()
  }

  private fun raiseAlarmVolume(audio: AudioManager) {
    try {
      if (savedAlarmVolume == null) savedAlarmVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM)
      audio.setStreamVolume(AudioManager.STREAM_ALARM, audio.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0)
    } catch (e: SecurityException) {
      Log.w(TAG, "cannot raise alarm volume", e)
    }
  }

  private fun restoreAlarmVolume() {
    val saved = savedAlarmVolume ?: return
    savedAlarmVolume = null
    val audio = appContext?.getSystemService(AudioManager::class.java) ?: return
    try {
      audio.setStreamVolume(AudioManager.STREAM_ALARM, saved, 0)
    } catch (e: SecurityException) {
      Log.w(TAG, "cannot restore alarm volume", e)
    }
  }

  private fun requestFocus(audio: AudioManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || focusRequest != null) return
    val request =
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(ALARM_ATTRS).build()
    audio.requestAudioFocus(request)
    focusRequest = request
  }

  private fun abandonFocus(audio: AudioManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    focusRequest?.let { audio.abandonAudioFocusRequest(it) }
    focusRequest = null
  }

  private fun vibrator(context: Context): Vibrator? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(VibratorManager::class.java)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION") context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }

  private fun vibrate(context: Context) {
    val v = vibrator(context) ?: return
    if (!v.hasVibrator()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      @Suppress("DEPRECATION") v.vibrate(VibrationEffect.createWaveform(VIBRATION, 0), ALARM_ATTRS)
    } else {
      @Suppress("DEPRECATION") v.vibrate(VIBRATION, 0)
    }
  }
}
