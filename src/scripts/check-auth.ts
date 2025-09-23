import { query, initializeDatabase } from '../config/database';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';

async function checkAuth() {
  try {
    await initializeDatabase();
    
    console.log('🔍 CHECKING AUTHENTICATION SETUP');
    console.log('==================================');
    
    // Check if users exist
    const usersResult = await query('SELECT id, email, name, role FROM users WHERE deleted_at IS NULL ORDER BY role DESC');
    console.log('\n👥 USERS IN DATABASE:');
    for (const user of usersResult.rows) {
      console.log(`  ${user.role.toUpperCase()}: ${user.name} (${user.email})`);
    }
    
    // Check specific CEO user
    const ceoResult = await query(`SELECT id, email, name, role, password_hash FROM users WHERE email = 'alex.ceo@company.com' AND deleted_at IS NULL`);
    
    if (ceoResult.rows.length === 0) {
      console.log('\n❌ CEO user not found!');
      
      // Let's check what users actually exist
      const allUsers = await query('SELECT email FROM users WHERE deleted_at IS NULL');
      console.log('Available users:');
      for (const user of allUsers.rows) {
        console.log(`  - ${user.email}`);
      }
      
      return;
    }
    
    const ceoUser = ceoResult.rows[0];
    console.log('\n✅ CEO user found:');
    console.log(`  Email: ${ceoUser.email}`);
    console.log(`  Name: ${ceoUser.name}`);
    console.log(`  Role: ${ceoUser.role}`);
    console.log(`  Password Hash: ${ceoUser.password_hash.substring(0, 20)}...`);
    
    // Test password verification
    const testPassword = 'TestPass123!';
    const passwordMatch = await bcrypt.compare(testPassword, ceoUser.password_hash);
    
    console.log(`\n🔑 PASSWORD TEST:`);
    console.log(`  Test Password: ${testPassword}`);
    console.log(`  Password Match: ${passwordMatch ? '✅ VALID' : '❌ INVALID'}`);
    
    if (!passwordMatch) {
      console.log('\n🛠️  FIXING PASSWORD...');
      // Fix the password
      const hashedPassword = await bcrypt.hash('TestPass123!', 12);
      await query('UPDATE users SET password_hash = $1 WHERE email = $2', [hashedPassword, 'alex.ceo@company.com']);
      console.log('✅ Password updated successfully!');
      
      // Verify the fix
      const updatedUser = await query(`SELECT password_hash FROM users WHERE email = 'alex.ceo@company.com'`);
      const newPasswordMatch = await bcrypt.compare('TestPass123!', updatedUser.rows[0].password_hash);
      console.log(`  New Password Test: ${newPasswordMatch ? '✅ VALID' : '❌ STILL INVALID'}`);
    }
    
    console.log('\n🎯 AUTHENTICATION STATUS: READY');
    console.log('You can now login with:');
    console.log('Email: alex.ceo@company.com');
    console.log('Password: TestPass123!');
    
  } catch (error) {
    logger.error('Auth check failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  checkAuth()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Auth check failed:', error);
      process.exit(1);
    });
}

export default checkAuth;