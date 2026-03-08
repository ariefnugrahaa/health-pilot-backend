import bcrypt from 'bcrypt';

async function generatePasswordHash() {
  const password = 'Admin123!';
  const hash = await bcrypt.hash(password, 12);
  console.log('Password:', password);
  console.log('Hash:', hash);
}

generatePasswordHash();
