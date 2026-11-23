import 'dotenv/config';
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      options.email = args[++i];
    } else if (args[i] === '--password' && args[i + 1]) {
      options.password = args[++i];
    } else if (args[i] === '--name' && args[i + 1]) {
      options.name = args[++i];
    } else if (args[i] === '--phone' && args[i + 1]) {
      options.phone = args[++i];
    }
  }
  return options;
}

function validatePasswordPolicy(password) {
  if (!password || typeof password !== 'string') {
    return 'Mật khẩu không được để trống';
  }
  if (password.length < 10) {
    return 'Mật khẩu phải dài ít nhất 10 ký tự';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Mật khẩu phải chứa ít nhất 1 chữ hoa';
  }
  if (!/[a-z]/.test(password)) {
    return 'Mật khẩu phải chứa ít nhất 1 chữ thường';
  }
  if (!/[0-9]/.test(password)) {
    return 'Mật khẩu phải chứa ít nhất 1 chữ số';
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return 'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt';
  }
  const disallowed = ['admin123', 'password123', '1234567890', 'admin@123', 'admin@ocop.gov.vn'];
  if (disallowed.includes(password.toLowerCase())) {
    return 'Mật khẩu nằm trong danh sách không an toàn';
  }
  return null;
}

async function main() {
  const args = parseArgs();
  const email = (args.email || process.env.INIT_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = args.password || process.env.INIT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '';
  const fullName = (args.name || process.env.INIT_ADMIN_NAME || process.env.ADMIN_FULL_NAME || process.env.ADMIN_NAME || 'Quản trị viên Hệ thống OCOP').trim();
  const phone = (args.phone || process.env.INIT_ADMIN_PHONE || process.env.ADMIN_PHONE || null)?.trim() || null;

  if (!email || !email.includes('@')) {
    console.error('❌ Lỗi: Email không hợp lệ. Vui lòng cung cấp --email hoặc INIT_ADMIN_EMAIL.');
    process.exit(1);
  }

  const passwordError = validatePasswordPolicy(password);
  if (passwordError) {
    console.error(`❌ Lỗi chính sách mật khẩu: ${passwordError}. Vui lòng cung cấp --password hoặc INIT_ADMIN_PASSWORD đáp ứng tiêu chuẩn.`);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Lỗi: DATABASE_URL không được cấu hình trong môi trường.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const client = await pool.connect();
    try {
      // 1. Kiểm tra role ADMIN
      const roleRes = await client.query('SELECT "id" FROM "roles" WHERE "name" = $1', ['ADMIN']);
      if (roleRes.rowCount === 0) {
        console.error('❌ Lỗi: Không tìm thấy vai trò ADMIN trong bảng roles. Hãy chạy migration trước.');
        process.exit(1);
      }
      const adminRoleId = roleRes.rows[0].id;

      // 2. Kiểm tra xem email đã tồn tại chưa
      const userCheckRes = await client.query('SELECT "id" FROM "users" WHERE LOWER("email") = LOWER($1)', [email]);
      if (userCheckRes.rowCount > 0) {
        console.error(`❌ Lỗi: Tài khoản với email "${email}" đã tồn tại. Không ghi đè.`);
        process.exit(1);
      }

      // 3. Hash mật khẩu bằng Argon2id
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });

      // 4. Tạo tài khoản Admin mới
      const userId = randomUUID();
      await client.query(
        `INSERT INTO "users" (
          "id", "email", "password_hash", "full_name", "phone", "role_id", "is_active", "must_change_password", "created_at", "updated_at"
        ) VALUES ($1, $2, $3, $4, $5, $6, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, email, passwordHash, fullName, phone, adminRoleId],
      );

      console.log('====================================================');
      console.log('✓ Khởi tạo tài khoản Quản trị viên (Admin) thành công!');
      console.log(`- ID: ${userId}`);
      console.log(`- Email: ${email}`);
      console.log(`- Họ tên: ${fullName}`);
      console.log('- Vai trò: ADMIN');
      console.log('- Trạng thái: Hoạt động (isActive: true)');
      console.log('- Đổi mật khẩu lần đầu (mustChangePassword): true (Bảo mật bắt buộc)');
      console.log('====================================================');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Lỗi khi khởi tạo tài khoản Admin:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
