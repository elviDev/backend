const { exec } = require('child_process');
const path = require('path');

console.log('🌱 Starting database seeding...');

// Change to backend directory and run seed
const command = 'cd backend && npx tsx src/scripts/seed.ts';

exec(command, { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Seed error:', error);
    return;
  }
  
  if (stderr) {
    console.error('⚠️  Seed stderr:', stderr);
  }
  
  console.log('✅ Seed output:', stdout);
  console.log('🎉 Database seeding completed!');
});