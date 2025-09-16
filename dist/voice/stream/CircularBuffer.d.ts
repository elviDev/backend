/**
 * Circular Buffer for Audio Data
 * Memory-efficient buffer with automatic overflow protection
 *
 * Success Criteria:
 * - Memory-efficient circular buffer implementation
 * - Automatic segment detection based on silence
 * - Handles variable-length audio segments
 * - Buffer overflow protection
 */
export declare class CircularBuffer {
    private buffer;
    private writeIndex;
    private readIndex;
    private size;
    private capacity;
    private sampleRate;
    private bytesPerSample;
    constructor(capacityInSamples: number);
    initialize(): Promise<void>;
    /**
     * Write audio data to buffer
     */
    write(data: Buffer): number;
    /**
     * Read specified number of bytes from buffer
     */
    read(bytes: number): Buffer;
    /**
     * Read all available data from buffer
     */
    readAll(): Buffer;
    /**
     * Peek at data without consuming it
     */
    peek(bytes: number): Buffer;
    /**
     * Clear all data from buffer
     */
    clear(): void;
    /**
     * Get current buffer level (0-1)
     */
    getLevel(): number;
    /**
     * Get available space in bytes
     */
    getAvailableSpace(): number;
    /**
     * Get current size in bytes
     */
    getSize(): number;
    /**
     * Get buffer capacity in bytes
     */
    getCapacity(): number;
    /**
     * Get buffer capacity in milliseconds
     */
    getCapacityMs(): number;
    /**
     * Get current buffer duration in milliseconds
     */
    getDurationMs(): number;
    /**
     * Get memory usage in bytes
     */
    getMemoryUsage(): number;
    /**
     * Check if buffer is empty
     */
    isEmpty(): boolean;
    /**
     * Check if buffer is full
     */
    isFull(): boolean;
    /**
     * Get buffer statistics
     */
    getStats(): {
        size: number;
        capacity: number;
        level: number;
        durationMs: number;
        capacityMs: number;
        memoryUsage: number;
    };
    /**
     * Resize buffer (creates new buffer and copies data)
     */
    resize(newCapacityInSamples: number): void;
    /**
     * Get RMS energy level of buffer content (for VAD purposes)
     */
    getRMSEnergy(): number;
    /**
     * Find silence periods in buffer (returns indices)
     */
    findSilencePeriods(threshold?: number, minDurationMs?: number): Array<{
        start: number;
        end: number;
    }>;
}
//# sourceMappingURL=CircularBuffer.d.ts.map