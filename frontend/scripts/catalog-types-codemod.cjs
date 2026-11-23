const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../src');
const pages = {
  'app/(dashboard)/dashboard/products/page.tsx': { imports: 'Product, Province, Ward, SellerProfile, ApiResponse', state: ['editingProduct', 'approvingProduct', 'rejectingProduct'], queries: { productsData: 'ApiResponse<Product[]>', provinces: 'Province[]', wards: 'Ward[]', metadataProducts: 'Product[]', sellers: 'SellerProfile[]' }, callbacks: { p: 'Product', product: 'Product', img: 'ProductImage', item: 'SellerProfile', cat: 'NamedRecord', lvl: 'OcopLevel', seller: 'SellerProfile', prov: 'Province', w: 'Ward' } },
  'app/(dashboard)/dashboard/news/page.tsx': { imports: 'NewsArticle, QueryParams, PaginationMeta', state: ['editingNews'], queries: { newsData: '{ items: NewsArticle[]; meta: PaginationMeta }' }, callbacks: { article: 'NewsArticle' } },
  'app/(dashboard)/dashboard/sellers/page.tsx': { imports: 'SellerProfile, Province, Ward, ApiResponse', state: ['editing', 'statusTarget'], queries: { profilesResponse: 'ApiResponse<SellerProfile[]>', provinces: 'Province[]', wards: 'Ward[]' }, callbacks: { profile: 'SellerProfile', item: 'Province' } },
  'app/(public)/products/page.tsx': { imports: 'Product, Province, Ward, NamedRecord, OcopLevel, QueryParams, ApiResponse', queries: { rawMetadata: 'Product[]', provinces: 'Province[]', wards: 'Ward[]', productsData: 'ApiResponse<Product[]>' }, callbacks: { p: 'Product', a: 'OcopLevel', b: 'OcopLevel', cat: 'NamedRecord', prov: 'Province', w: 'Ward', lvl: 'OcopLevel', product: 'Product' } },
  'app/(public)/products/[id]/page.tsx': { imports: 'Product, ProductImage', queries: { product: 'Product' }, callbacks: { a: 'ProductImage', b: 'ProductImage', img: 'ProductImage' } },
  'app/(public)/news/page.tsx': { imports: 'NewsArticle, QueryParams', callbacks: { article: 'NewsArticle' } },
  'app/(public)/shops/page.tsx': { imports: 'SellerProfile, Province, Product, QueryParams', callbacks: { s: 'SellerProfile', prov: 'Province', seller: 'SellerProfile', prod: 'Product' } },
  'app/(public)/shops/[id]/page.tsx': { imports: 'SellerProfile, Product, QueryParams, ApiResponse', queries: { shop: 'SellerProfile', allProductsRaw: 'Product[]', productsData: 'ApiResponse<Product[]>' }, callbacks: { p: 'Product', product: 'Product' } },
  'app/(public)/page.tsx': { imports: 'Product, NewsArticle, Province, Ward', state: ['selectedProvince'], callbacks: { product: 'Product', province: 'Province', ward: 'Ward', article: 'NewsArticle' } },
};
for (const [name, options] of Object.entries(pages)) {
  const file = path.join(root, name);
  let source = fs.readFileSync(file, 'utf8');
  const imported = new Set(options.imports.split(', '));
  for (const [variable, type] of Object.entries(options.callbacks ?? {})) {
    const matcher = new RegExp(`\\b${variable}: any\\b`, 'g');
    if (matcher.test(source)) { source = source.replace(matcher, `${variable}: ${type}`); imported.add(type); }
  }
  for (const state of options.state ?? []) {
    const type = state === 'editingNews' ? 'NewsArticle' : state === 'selectedProvince' ? 'Province' : ['editing', 'statusTarget'].includes(state) ? 'SellerProfile' : 'Product';
    const matcher = new RegExp(`(const \\[${state},[^\\n]+?useState)<any>`, 'g');
    source = source.replace(matcher, `$1<${type} | null>`);
  }
  for (const [query, type] of Object.entries(options.queries ?? {})) {
    const matcher = new RegExp(`(const \\{ data: ${query}\\b[^\\n]*?= useQuery)\\(`, 'g');
    source = source.replace(matcher, `$1<${type}>(`);
  }
  if (source.includes('params: any')) { source = source.replace(/params: any/g, 'params: QueryParams'); imported.add('QueryParams'); }
  source = source.replace(/const topProducts: any\[\]/g, 'const topProducts: Product[]')
    .replace(/const newsList: any\[\]/g, 'const newsList: NewsArticle[]')
    .replace(/const displayedProvinces: any\[\]/g, 'const displayedProvinces: Province[]');
  source = source.replace(/(import\s)/, `import type { ${[...imported].join(', ')} } from '@/types/catalog';\n\n$1`);
  fs.writeFileSync(file, source);
}
