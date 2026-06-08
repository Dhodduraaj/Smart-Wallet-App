package com.smartwallet.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfDownloaderPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @CapacitorPlugin(name = "PdfDownloader")
    public static class PdfDownloaderPlugin extends Plugin {
        @PluginMethod
        public void downloadPdf(PluginCall call) {
            String filePath = call.getString("filePath");
            String fileName = call.getString("fileName", "smart-wallet-report.pdf");

            if (filePath == null) {
                call.reject("filePath is required");
                return;
            }

            try {
                Uri fileUri = Uri.parse(filePath);
                ContentResolver resolver = getContext().getContentResolver();
                InputStream in = resolver.openInputStream(fileUri);
                if (in == null) {
                    call.reject("Could not open source file");
                    return;
                }

                Uri destinationUri = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                    destinationUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);

                    if (destinationUri == null) {
                        in.close();
                        call.reject("Failed to create MediaStore entry");
                        return;
                    }

                    try (OutputStream out = resolver.openOutputStream(destinationUri)) {
                        byte[] buffer = new byte[8192];
                        int bytesRead;
                        while ((bytesRead = in.read(buffer)) != -1) {
                            out.write(buffer, 0, bytesRead);
                        }
                    }
                } else {
                    File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!downloadsDir.exists()) {
                        downloadsDir.mkdirs();
                    }
                    File file = new File(downloadsDir, fileName);
                    try (OutputStream out = new FileOutputStream(file)) {
                        byte[] buffer = new byte[8192];
                        int bytesRead;
                        while ((bytesRead = in.read(buffer)) != -1) {
                            out.write(buffer, 0, bytesRead);
                        }
                    }
                    destinationUri = Uri.fromFile(file);
                }
                in.close();

                // Trigger media scan to make the file visible in file manager
                String scanPath = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    // MediaStore automatic handles this, but scanning doesn't hurt
                } else {
                    scanPath = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), fileName).getAbsolutePath();
                }
                if (scanPath != null) {
                    android.media.MediaScannerConnection.scanFile(
                        getContext(),
                        new String[]{scanPath},
                        new String[]{"application/pdf"},
                        null
                    );
                }

                // Open the PDF using Intent (ACTION_VIEW)
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(destinationUri, "application/pdf");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    getContext().startActivity(intent);
                } catch (Exception e) {
                    // Ignore if no PDF viewer app is installed on the device
                }

                call.resolve();
            } catch (Exception e) {
                call.reject("Error saving PDF: " + e.getMessage());
            }
        }
    }
}
