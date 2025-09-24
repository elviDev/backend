#!/usr/bin/env tsx
/**
 * Get CEO user information including email and password hash
 */
declare function getCEOInfo(): Promise<{
    name: string;
    email: string;
    id: string;
    phone: string | undefined;
    department: string | undefined;
    created_at: Date;
} | null>;
export { getCEOInfo };
//# sourceMappingURL=get-ceo-info.d.ts.map