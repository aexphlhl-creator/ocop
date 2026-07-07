import { PrismaClient, User } from '@prisma/client';

export async function seedNews(
  prisma: PrismaClient,
  usersMap: Record<string, User>
): Promise<number> {
  const adminUser = usersMap['admin@ocop.gov.vn'];

  if (!adminUser) {
    throw new Error('Missing admin user reference for seeding news');
  }

  const newsData = [
    {
      title: 'Đẩy mạnh phát triển thương mại điện tử cho sản phẩm OCOP',
      slug: 'day-manh-phat-trien-thuong-mai-dien-tu-cho-san-pham-ocop',
      content: 'Chương trình chuyển đổi số nông thôn thúc đẩy xúc tiến thương mại nông sản OCOP của địa phương lên sàn thương mại điện tử bản đồ số nhằm tiếp cận đông đảo người tiêu dùng cả nước.',
      thumbnail: 'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&w=800&q=80',
      authorId: adminUser.id,
      status: 'PUBLISHED',
    },
    {
      title: 'Bản đồ số OCOP - Giải pháp kết nối cung cầu thời đại mới',
      slug: 'ban-do-so-ocop-giai-phap-ket-noi-cung-cau-thoi-dai-moi',
      content: 'Bản đồ số OCOP giúp trực quan hóa vị trí địa lý, quy trình sản xuất sạch của từng chủ thể tại các vùng nông thôn Việt Nam, giúp nâng tầm giá trị nông sản và phát triển du lịch địa phương.',
      thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
      authorId: adminUser.id,
      status: 'PUBLISHED',
    },
  ];

  let count = 0;
  for (const post of newsData) {
    await prisma.news.upsert({
      where: { slug: post.slug },
      update: {
        title: post.title,
        content: post.content,
        thumbnail: post.thumbnail,
        authorId: post.authorId,
        status: post.status,
      },
      create: post,
    });
    count++;
  }
  return count;
}
