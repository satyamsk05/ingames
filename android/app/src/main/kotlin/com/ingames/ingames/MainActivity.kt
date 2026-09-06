package com.ingames.ingames

import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val windowInstance = window
            val params = windowInstance.attributes
            val currentDisplay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                display
            } else {
                @Suppress("DEPRECATION")
                windowInstance.windowManager.defaultDisplay
            }
            if (currentDisplay != null) {
                var maxRefreshRate = 60.0f
                var bestModeId = params.preferredDisplayModeId
                for (mode in currentDisplay.supportedModes) {
                    if (mode.refreshRate > maxRefreshRate) {
                        maxRefreshRate = mode.refreshRate
                        bestModeId = mode.modeId
                    }
                }
                if (bestModeId != params.preferredDisplayModeId) {
                    params.preferredDisplayModeId = bestModeId
                    windowInstance.attributes = params
                }
            }
        }
    }
}
