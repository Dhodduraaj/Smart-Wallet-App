package com.smartwallet.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(PdfDownloaderPlugin.class);
    }

    @CapacitorPlugin(name = "PdfDownloader")
    public static class PdfDownloaderPlugin extends Plugin {
        @PluginMethod
        public void downloadPdf(PluginCall call) {
            String base64Data = call.getString("data");
            String fileName = call.getString("fileName", "smart-wallet-report.pdf");

            if (base64Data == null) {
                call.reject("Data is required");
                return;
            }

            try {
                byte[] pdfBytes = Base64.decode(base64Data, Base64.DEFAULT);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                    ContentResolver resolver = getContext().getContentResolver();
                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);

                    if (uri == null) {
                        call.reject("Failed to create MediaStore entry");
                        return;
                    }

                    try (OutputStream out = resolver.openOutputStream(uri)) {
                        out.write(pdfBytes);
                    }

                    call.resolve();
                } else {
                    File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!downloadsDir.exists()) {
                        downloadsDir.mkdirs();
                    }
                    File file = new File(downloadsDir, fileName);
                    try (FileOutputStream fos = new FileOutputStream(file)) {
                        fos.write(pdfBytes);
                    }

                    // Trigger media scan to make it visible
                    android.media.MediaScannerConnection.scanFile(
                        getContext(),
                        new String[]{file.getAbsolutePath()},
                        new String[]{"application/pdf"},
                        null
                    );

                    call.resolve();
                }
            } catch (Exception e) {
                call.reject("Error saving PDF: " + e.getMessage());
            }
        }
    }
}
