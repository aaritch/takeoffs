/**
 * Malware scanning (P1-02). A pluggable interface so a real engine (ClamAV/clamd over a socket)
 * drops in later without touching the pipeline. The default `eicarScanner` detects the standard
 * EICAR antivirus test signature — a safe, industry-standard way to exercise the malware path in
 * tests and staging without a real virus.
 */

export interface ScanResult {
  clean: boolean;
  /** Name of the matched signature when not clean. */
  signature?: string;
}

export interface Scanner {
  scan(bytes: Uint8Array): Promise<ScanResult>;
}

// The EICAR test string (https://www.eicar.org/download-anti-malware-testfile/). Split so this
// source file itself never contains the full literal signature.
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}' + '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export const eicarScanner: Scanner = {
  async scan(bytes: Uint8Array): Promise<ScanResult> {
    // EICAR is ASCII; only inspect a bounded prefix so huge files don't blow up the scan.
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
    return head.includes(EICAR) ? { clean: false, signature: 'EICAR-Test-File' } : { clean: true };
  },
};
