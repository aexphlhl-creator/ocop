import { PrismaClient, Category } from '@prisma/client';

export async function seedCategories(prisma: PrismaClient): Promise<Record<string, Category>> {
  const categoriesData = [
    { name: 'Thực phẩm', slug: 'thuc-pham', description: 'Các sản phẩm nông sản chế biến, đồ khô' },
    { name: 'Đồ uống', slug: 'do-uong', description: 'Trà, cà phê, rượu vang địa phương' },
    { name: 'Thảo dược', slug: 'thao-duoc', description: 'Dược liệu, tinh dầu, thực phẩm chức năng' },
    { name: 'Thủ công mỹ nghệ', slug: 'thu-cong-my-nghe', description: 'Gốm sứ, mây tre đan, dệt thổ cẩm' },
    { name: 'Dịch vụ du lịch nông thôn', slug: 'du-lich-nong-thon', description: 'Homestay, điểm tham quan làng nghề' },
  ];

  const categoriesMap: Record<string, Category> = {};
  for (const cat of categoriesData) {
    const createdCat = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        description: cat.description,
      },
      create: cat,
    });
    categoriesMap[cat.name] = createdCat;
  }
  return categoriesMap;
}
