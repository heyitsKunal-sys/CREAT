"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { QrCode, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { useConvexMutation } from "@/hooks/use-convex-query";
import { api } from "@/convex/_generated/api";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";

export default function QRScannerModal({ isOpen, onClose }) {
  const scannerRef = useRef(null);
  const fileInputRef = useRef(null);
  const isClosingRef = useRef(false);
  const isScanningRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { mutate: checkInAttendee } = useConvexMutation(
    api.registrations.checkInAttendee
  );

  // ===============================
  // SAFELY close scanner
  // ===============================
  const safeClose = useCallback(async () => {
    if (isClosingRef.current) return; // Prevent multiple close attempts
    isClosingRef.current = true;

    const scanner = scannerRef.current;
    if (scanner && isScanningRef.current) {
      try {
        // Stop the scanner properly
        await scanner.stop().catch((err) => {
          // Ignore errors if scanner is already stopped
          if (err && !err.message?.includes("already stopped")) {
            console.warn("Error stopping scanner:", err);
          }
        });
        
        // Clear the scanner
        await scanner.clear().catch((err) => {
          // Ignore clear errors
          console.warn("Error clearing scanner:", err);
        });
      } catch (err) {
        console.warn("Error during scanner cleanup:", err);
      }
    }

    scannerRef.current = null;
    isScanningRef.current = false;
    setLoading(false);
    isClosingRef.current = false;
    onClose();
  }, [onClose]);

  // ===============================
  // Handle QR result
  // ===============================
  const handleResult = useCallback(async (qrCode) => {
    if (isClosingRef.current) return; // Prevent handling result if already closing
    
    try {
      await checkInAttendee({ qrCode });
      toast.success("✅ Check-in successful");
      await safeClose();
    } catch {
      toast.error("Invalid or already used QR code");
    }
  }, [checkInAttendee, safeClose]);

  // ===============================
  // Start CAMERA scanner
  // ===============================
  useEffect(() => {
    if (!isOpen) {
      // Clean up when modal is closed
      if (scannerRef.current && isScanningRef.current) {
        const cleanup = async () => {
          isClosingRef.current = true;
          const scanner = scannerRef.current;
          if (scanner) {
            try {
              await scanner.stop().catch(() => {});
              await scanner.clear().catch(() => {});
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          scannerRef.current = null;
          isScanningRef.current = false;
          isClosingRef.current = false;
        };
        cleanup();
      }
      return;
    }

    if (scannerRef.current || isScanningRef.current) return; // prevent double start

    let cancelled = false;
    isClosingRef.current = false;

    const startCamera = async () => {
      try {
        setLoading(true);
        setError(null);

        // wait for Dialog DOM
        await new Promise((r) => setTimeout(r, 500));
        if (cancelled || isClosingRef.current) return;

        const { Html5Qrcode } = await import("html5-qrcode");

        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;
        isScanningRef.current = true;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: 250,
            disableFlip: false,
            showTorchButtonIfSupported: false,
            showZoomSliderIfSupported: false,
          },
          async (decodedText) => {
            // Prevent callback from executing if we're already closing
            if (isClosingRef.current || cancelled) return;

            const currentScanner = scannerRef.current;
            if (currentScanner && isScanningRef.current) {
              try {
                await currentScanner.stop();
                scannerRef.current = null;
                isScanningRef.current = false;
              } catch (err) {
                // Scanner might already be stopped, ignore error
                scannerRef.current = null;
                isScanningRef.current = false;
              }
            }
            
            handleResult(decodedText);
          }
        );

        setLoading(false);
      } catch (err) {
        // Check if error is due to cancellation
        if (cancelled || isClosingRef.current) {
          return;
        }
        console.error(err);
        setError("Camera stopped. Please close and reopen scanner.");
        setLoading(false);
        scannerRef.current = null;
        isScanningRef.current = false;
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      isClosingRef.current = true;
      
      const scanner = scannerRef.current;
      if (scanner && isScanningRef.current) {
        // Stop scanner synchronously in cleanup
        scanner.stop().catch(() => {}).finally(() => {
          scanner.clear().catch(() => {});
        });
        scannerRef.current = null;
        isScanningRef.current = false;
      }
    };
  }, [isOpen, handleResult]);

  // ===============================
  // Scan from IMAGE
  // ===============================
  const handleImageScan = async (file) => {
    if (!file) return;

    try {
      setLoading(true);

      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");

      const decodedText = await scanner.scanFile(file, true);
      handleResult(decodedText);
    } catch {
      toast.error("No QR code found in image");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => {
        if (!open) {
          safeClose();
        }
      }}
    >
      <DialogContent forceMount className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-purple-500" />
            Scan QR Code
          </DialogTitle>
          <DialogDescription>
            Use camera or upload a QR image
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-sm text-red-500 mb-2">{error}</p>
        )}

        {/* CAMERA VIEW */}
        <div
          id="qr-reader"
          className="w-full rounded-md bg-black"
          style={{ minHeight: "300px" }}
        />

        {loading && (
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
            <span className="text-sm">Processing…</span>
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => fileInputRef.current.click()}
          >
            <Upload className="w-4 h-4" />
            Scan Image
          </Button>

          <Button
            variant="destructive"
            className="flex-1 gap-2"
            onClick={safeClose}
          >
            <X className="w-4 h-4" />
            Close
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleImageScan(e.target.files[0])}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
