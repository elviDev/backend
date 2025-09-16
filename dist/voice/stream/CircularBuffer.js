"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircularBuffer = void 0;
const logger_1 = require("../../utils/logger");
class CircularBuffer {
    buffer;
    writeIndex = 0;
    readIndex = 0;
    size = 0;
    capacity;
    sampleRate = 16000; // Default 16kHz
    bytesPerSample = 2; // 16-bit PCM
    constructor(capacityInSamples) {
        this.capacity = capacityInSamples * this.bytesPerSample;
        this.buffer = Buffer.allocUnsafe(this.capacity);
        this.buffer.fill(0);
    }
    async initialize() {
        // Initialize buffer state
        this.writeIndex = 0;
        this.readIndex = 0;
        this.size = 0;
        this.buffer.fill(0);
        logger_1.logger.debug('Circular buffer initialized', {
            capacity: this.capacity,
            capacityMs: this.getCapacityMs(),
        });
    }
    /**
     * Write audio data to buffer
     */
    write(data) {
        if (data.length === 0) {
            return 0;
        }
        const bytesToWrite = Math.min(data.length, this.capacity - this.size);
        if (bytesToWrite < data.length) {
            // Buffer overflow - log warning but continue with partial write
            logger_1.logger.warn('Circular buffer overflow', {
                requestedBytes: data.length,
                availableBytes: bytesToWrite,
                bufferSize: this.size,
                capacity: this.capacity,
            });
        }
        let written = 0;
        for (let i = 0; i < bytesToWrite; i++) {
            this.buffer[this.writeIndex] = data[i] ?? 0;
            this.writeIndex = (this.writeIndex + 1) % this.capacity;
            written++;
            // Update size only if buffer not full
            if (this.size < this.capacity) {
                this.size++;
            }
            else {
                // If buffer is full, advance read index (overwrite oldest data)
                this.readIndex = (this.readIndex + 1) % this.capacity;
            }
        }
        return written;
    }
    /**
     * Read specified number of bytes from buffer
     */
    read(bytes) {
        const bytesToRead = Math.min(bytes, this.size);
        const result = Buffer.allocUnsafe(bytesToRead);
        for (let i = 0; i < bytesToRead; i++) {
            result[i] = this.buffer[this.readIndex] ?? 0;
            this.readIndex = (this.readIndex + 1) % this.capacity;
            this.size--;
        }
        return result;
    }
    /**
     * Read all available data from buffer
     */
    readAll() {
        return this.read(this.size);
    }
    /**
     * Peek at data without consuming it
     */
    peek(bytes) {
        const bytesToPeek = Math.min(bytes, this.size);
        const result = Buffer.allocUnsafe(bytesToPeek);
        let peekIndex = this.readIndex;
        for (let i = 0; i < bytesToPeek; i++) {
            result[i] = this.buffer[peekIndex] ?? 0;
            peekIndex = (peekIndex + 1) % this.capacity;
        }
        return result;
    }
    /**
     * Clear all data from buffer
     */
    clear() {
        this.writeIndex = 0;
        this.readIndex = 0;
        this.size = 0;
        this.buffer.fill(0);
    }
    /**
     * Get current buffer level (0-1)
     */
    getLevel() {
        return this.size / this.capacity;
    }
    /**
     * Get available space in bytes
     */
    getAvailableSpace() {
        return this.capacity - this.size;
    }
    /**
     * Get current size in bytes
     */
    getSize() {
        return this.size;
    }
    /**
     * Get buffer capacity in bytes
     */
    getCapacity() {
        return this.capacity;
    }
    /**
     * Get buffer capacity in milliseconds
     */
    getCapacityMs() {
        const samples = this.capacity / this.bytesPerSample;
        return (samples / this.sampleRate) * 1000;
    }
    /**
     * Get current buffer duration in milliseconds
     */
    getDurationMs() {
        const samples = this.size / this.bytesPerSample;
        return (samples / this.sampleRate) * 1000;
    }
    /**
     * Get memory usage in bytes
     */
    getMemoryUsage() {
        return this.capacity + 32 * 4; // Buffer + overhead for indices
    }
    /**
     * Check if buffer is empty
     */
    isEmpty() {
        return this.size === 0;
    }
    /**
     * Check if buffer is full
     */
    isFull() {
        return this.size === this.capacity;
    }
    /**
     * Get buffer statistics
     */
    getStats() {
        return {
            size: this.size,
            capacity: this.capacity,
            level: this.getLevel(),
            durationMs: this.getDurationMs(),
            capacityMs: this.getCapacityMs(),
            memoryUsage: this.getMemoryUsage(),
        };
    }
    /**
     * Resize buffer (creates new buffer and copies data)
     */
    resize(newCapacityInSamples) {
        const newCapacity = newCapacityInSamples * this.bytesPerSample;
        const newBuffer = Buffer.allocUnsafe(newCapacity);
        newBuffer.fill(0);
        // Copy existing data to new buffer
        const existingData = this.readAll();
        this.buffer = newBuffer;
        this.capacity = newCapacity;
        this.writeIndex = 0;
        this.readIndex = 0;
        this.size = 0;
        // Write existing data back
        this.write(existingData);
        logger_1.logger.debug('Circular buffer resized', {
            oldCapacity: this.capacity,
            newCapacity,
            preservedBytes: existingData.length,
        });
    }
    /**
     * Get RMS energy level of buffer content (for VAD purposes)
     */
    getRMSEnergy() {
        if (this.size === 0) {
            return 0;
        }
        let sum = 0;
        let index = this.readIndex;
        const samples = this.size / this.bytesPerSample;
        for (let i = 0; i < samples; i++) {
            // Read 16-bit sample (little-endian)
            const sample = this.buffer.readInt16LE(index);
            sum += sample * sample;
            index = (index + this.bytesPerSample) % this.capacity;
        }
        return Math.sqrt(sum / samples) / 32768.0; // Normalize to 0-1
    }
    /**
     * Find silence periods in buffer (returns indices)
     */
    findSilencePeriods(threshold = 0.01, minDurationMs = 500) {
        const silencePeriods = [];
        if (this.size === 0) {
            return silencePeriods;
        }
        const samples = this.size / this.bytesPerSample;
        const minSamples = (minDurationMs / 1000) * this.sampleRate;
        let silenceStart = -1;
        let index = this.readIndex;
        for (let i = 0; i < samples; i++) {
            const sample = Math.abs(this.buffer.readInt16LE(index)) / 32768.0;
            if (sample < threshold) {
                if (silenceStart === -1) {
                    silenceStart = i;
                }
            }
            else {
                if (silenceStart !== -1) {
                    const silenceDuration = i - silenceStart;
                    if (silenceDuration >= minSamples) {
                        silencePeriods.push({
                            start: silenceStart,
                            end: i,
                        });
                    }
                    silenceStart = -1;
                }
            }
            index = (index + this.bytesPerSample) % this.capacity;
        }
        // Handle silence at end of buffer
        if (silenceStart !== -1) {
            const silenceDuration = samples - silenceStart;
            if (silenceDuration >= minSamples) {
                silencePeriods.push({
                    start: silenceStart,
                    end: samples,
                });
            }
        }
        return silencePeriods;
    }
}
exports.CircularBuffer = CircularBuffer;
//# sourceMappingURL=CircularBuffer.js.map