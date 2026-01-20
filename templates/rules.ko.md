# 프론트엔드 코드리뷰 규칙

좋은 프론트엔드 코드는 **변경하기 쉬운** 코드입니다. 코드가 변경하기 쉬운지는 4가지 기준으로 판단합니다.

---

## 기술 스택 및 활용 라이브러리

| 영역 | 라이브러리 | 용도 |
|------|-----------|------|
| **상태 관리** | `@tanstack/react-query` v5 | 서버 상태 관리 |
| **스타일링** | `@emotion/styled`, `@emotion/css` | CSS-in-JS |
| **패턴 매칭** | `ts-pattern` | 타입 안전한 조건 분기 |
| **조건부 렌더링** | `Show`, `SwitchCase` | 유틸리티 컴포넌트 |
| **로깅** | `LoggerBoundary` | Context 기반 로깅 시스템 |
| **유효성 검사** | `zod` | 런타임 스키마 검증 |
| **플로우 관리** | `@use-funnel/next` | 단계별 플로우 상태 관리 |
| **오버레이 관리** | `overlay-kit` | 모달/바텀시트 관리 |

---

## 디렉토리 구조 컨벤션

```
src/
├── features/           # 도메인별 컴포넌트 그룹 (페이지 단위 기능)
├── components/         # 공통 재사용 컴포넌트
├── hooks/              # 커스텀 훅
├── queries/            # react-query 훅 (API 호출)
├── queryKeys/          # query key 팩토리
├── endpoints/          # API 클라이언트 정의
├── models/             # DTO 타입 정의
├── constants/          # 상수 정의
├── utils/              # 유틸리티 함수
└── pages/              # Next.js 페이지 라우트
```

---

## 1. 가독성 (Readability)

코드가 읽기 쉬운 정도를 말합니다. 코드가 변경하기 쉬우려면 먼저 코드가 어떤 동작을 하는지 이해할 수 있어야 합니다.

### 체크리스트

#### 맥락 줄이기
- [ ] 같이 실행되지 않는 코드가 하나의 함수/컴포넌트에 섞여 있지 않은가?
- [ ] 구현 상세가 적절히 추상화되어 있는가?
- [ ] 로직 종류에 따라 합쳐진 함수가 적절히 분리되어 있는가?

#### 이름 붙이기
- [ ] 복잡한 조건에 의미 있는 이름이 붙어 있는가?
- [ ] 매직 넘버에 이름이 붙어 있는가?

#### 위에서 아래로 읽히게 하기
- [ ] 코드를 읽을 때 시점 이동이 최소화되어 있는가?
- [ ] 삼항 연산자가 단순하게 사용되고 있는가?
- [ ] 코드가 왼쪽에서 오른쪽으로 자연스럽게 읽히는가?

### 🔧 방법론: 조건부 렌더링 패턴

#### ❌ Bad: 복잡한 삼항 연산자 중첩

```tsx
function ProductStatus({ status }: Props) {
  return (
    <div>
      {status === 'PENDING' ? (
        <PendingBadge />
      ) : status === 'ISSUED' ? (
        <IssuedBadge />
      ) : status === 'EXPIRED' ? (
        <ExpiredBadge />
      ) : null}
    </div>
  );
}
```

#### ✅ Good: `ts-pattern` 활용한 패턴 매칭

```tsx
import { match } from 'ts-pattern';
import { ESimStatusEnum } from '~models/SimDto';

function ProductStatus({ status }: Props) {
  return (
    <div>
      {match(status)
        .with(ESimStatusEnum.PENDING, () => <PendingBadge />)
        .with(ESimStatusEnum.LOCAL_ISSUED, () => <IssuedBadge />)
        .with(ESimStatusEnum.ROAMING_ISSUED, () => <IssuedBadge />)
        .with(ESimStatusEnum.EXPIRED, () => <ExpiredBadge />)
        .otherwise(() => null)}
    </div>
  );
}
```

> **Tip**: `.exhaustive()`를 사용하면 모든 케이스를 처리했는지 컴파일 타임에 검증할 수 있습니다.

#### ✅ Good: `SwitchCase` 컴포넌트 활용

```tsx
import SwitchCase from '~components/SwitchCase';

function ProductStatus({ status }: Props) {
  return (
    <SwitchCase
      value={status}
      caseBy={{
        PENDING: <PendingBadge />,
        LOCAL_ISSUED: <IssuedBadge />,
        EXPIRED: <ExpiredBadge />,
      }}
      defaultComponent={null}
    />
  );
}
```

#### ✅ Good: `Show` 컴포넌트로 조건부 렌더링

```tsx
import Show from '~components/Show';

function ProductCard({ product }: Props) {
  return (
    <Card>
      <Title>{product.name}</Title>
      
      {/* 단순 조건부 렌더링 */}
      <Show when={product.isOnSale}>
        <SaleBadge />
      </Show>
      
      {/* render prop으로 타입 안전하게 값 사용 */}
      <Show when={product.discount}>
        {(discount) => <DiscountLabel value={discount} />}
      </Show>
      
      {/* 타입이 보장된 데이터를 사용해야 할 때 */}
      <Show when={isLoggedIn} params={user}>
        {(user) => <UserProfile user={user} />}
      </Show>
    </Card>
  );
}
```

### 🔧 방법론: 매직 넘버 상수화

#### ❌ Bad: 매직 넘버 하드코딩

```tsx
function DetailHeader() {
  return (
    <Header style={{ height: 52, zIndex: 90 }}>
      <Tab style={{ height: 48 }} />
    </Header>
  );
}
```

#### ✅ Good: 상수 파일에서 관리

```tsx
// constants/productDetail.ts
export const HEADER_NAVI_HEIGHT = 52;
export const HEADER_NAVI_Z_INDEX = 90;
export const TAB_HEIGHT = 48;
export const DETAIL_BOTTOM_BAR_MIN_HEIGHT = 76;
export const TOAST_BOTTOM_GAP = 12;

// 파생 상수는 기존 상수 조합으로 정의
export const DETAIL_TOAST_VERTICAL_OFFSET = DETAIL_BOTTOM_BAR_MIN_HEIGHT + TOAST_BOTTOM_GAP;
```

```tsx
// 컴포넌트에서 사용
import { HEADER_NAVI_HEIGHT, HEADER_NAVI_Z_INDEX, TAB_HEIGHT } from '~constants/productDetail';

function DetailHeader() {
  return (
    <Header style={{ height: HEADER_NAVI_HEIGHT, zIndex: HEADER_NAVI_Z_INDEX }}>
      <Tab style={{ height: TAB_HEIGHT }} />
    </Header>
  );
}
```

---

## 2. 예측 가능성 (Predictability)

함수나 컴포넌트의 동작을 얼마나 예측할 수 있는지를 말합니다. 예측 가능성이 높은 코드는 일관적인 규칙을 따르고, 이름과 파라미터, 반환 값만 보고도 어떤 동작을 하는지 알 수 있습니다.

### 체크리스트

- [ ] 같은 이름을 가진 함수/변수가 동일한 동작을 하는가?
- [ ] 라이브러리 함수와 서비스 함수의 이름이 명확히 구분되는가?
- [ ] 같은 종류의 함수는 반환 타입이 통일되어 있는가?
- [ ] 숨겨진 로직 없이 동작이 명시적으로 드러나는가?

### 🔧 방법론: Query Hook 네이밍 컨벤션

#### ✅ Good: 일관된 Query Hook 패턴

```tsx
// queries/sim/useSearchProductDetail.ts
import { useQuery } from '@tanstack/react-query';
import { simApi } from '~endpoints/Sim';
import { simKeys } from '~queryKeys/sim';

type ProductCode = Parameters<typeof simApi.v1.search.getProductDetail>[0];
type Query = Parameters<typeof simApi.v1.search.getProductDetail>[1];

// fetcher 함수는 별도 분리
async function getSearchProductDetail(productCode: ProductCode, query: Query) {
  return await simApi.v1.search.getProductDetail(productCode, query);
}

// Hook은 use 접두사 + 도메인 + 동작
export function useSearchProductDetail(
  productCode: ProductCode,
  query: Query,
  options?: Record<string, unknown>,
) {
  return useQuery({
    queryKey: simKeys.searchProductDetail(productCode, query),
    queryFn: () => getSearchProductDetail(productCode, query),
    select: (data) => data.data,  // 일관된 data 추출 패턴
    ...options,
  });
}
```

**네이밍 규칙:**
- `useSearch*`: 검색 관련 쿼리
- `useProductDetail*`: 상품 상세 관련 쿼리
- `useESim*`: eSIM 관리 관련 쿼리
- `use*Query`: 복잡한 쿼리 (suffix로 구분)

### 🔧 방법론: Query Key 팩토리 패턴

#### ✅ Good: queryKeys 중앙 관리

```tsx
// queryKeys/sim.ts
export const simKeys = {
  all: ['sim'] as const,
  
  // 검색 관련
  search: () => [...simKeys.all, 'search'] as const,
  searchResult: (query: string) => [...simKeys.search(), query] as const,
  searchProductDetail: (code: string, query: object) => 
    [...simKeys.search(), 'detail', code, query] as const,
  
  // 상품 상세 관련
  productDetail: () => [...simKeys.all, 'productDetail'] as const,
  productDetailHeader: (gid: number) => 
    [...simKeys.productDetail(), 'header', gid] as const,
  productDetailPartitions: (gid: number) => 
    [...simKeys.productDetail(), 'partitions', gid] as const,
  
  // eSIM 관리 관련
  management: () => [...simKeys.all, 'management'] as const,
  eSimGroupList: (groupCode?: string) => 
    [...simKeys.management(), 'groupList', groupCode] as const,
};
```

### 🔧 방법론: Endpoint 클래스 패턴

#### ✅ Good: 계층적 API 구조

```tsx
// endpoints/Sim.ts
class SimApi<SecurityDataType> extends HttpClient<SecurityDataType> {
  v1 = {
    esim: {
      getProductDetailHeader: (gid: number, params: RequestParams = {}) =>
        this.request<ResourceProductDetailHeaderResponse>({
          path: `/api/v1/esim/product-detail/${gid}/header`,
          method: 'GET',
          ...params,
        }),
    },
    search: {
      getSearch: (query: string, params: RequestParams = {}) =>
        this.request<ResourceSearchResultListResponse>({
          path: `/api/v1/esim/search`,
          method: 'GET',
          query: { query },
          ...params,
        }),
    },
    management: {
      getESimGroupList: (groupCode?: string, params: RequestParams = {}) =>
        this.request<ResourceESimGroupListResponse>({
          path: `/api/v1/esim/management/list`,
          method: 'GET',
          ...(groupCode && { query: { groupCode } }),
          ...params,
        }),
    },
  };
}
```

**구조 규칙:**
- `v1.{도메인}.{동작}` 형태의 계층 구조
- GET 요청: `get*`, POST 요청: `post*`, `create*`, `register*`
- 응답 타입은 `Resource*Response` 형태로 통일

---

## 3. 응집도 (Cohesion)

수정되어야 할 코드가 항상 같이 수정되는지를 말합니다. 응집도가 높은 코드는 한 부분을 수정해도 의도치 않게 다른 부분에서 오류가 발생하지 않습니다.

### 체크리스트

- [ ] 함께 수정되는 파일이 같은 디렉토리에 있는가?
- [ ] 도메인별로 코드가 적절히 분리되어 있는가?
- [ ] 매직 넘버가 상수로 정의되어 한 곳에서 관리되는가?
- [ ] 폼 필드와 유효성 검사 로직이 함께 관리되는가?

### 🔧 방법론: Feature 기반 디렉토리 구조

#### ✅ Good: 도메인별 응집된 구조

```
features/productDetails/
├── DetailEntry.tsx                    # 진입점 컴포넌트
├── DetailSectionContainer.tsx         # 공통 섹션 컨테이너
├── DetailHeader/                      # 헤더 도메인
│   ├── DetailHeader.tsx
│   ├── DetailHeaderImages/
│   │   ├── DetailHeaderImages.tsx
│   │   ├── ImageCarousel.tsx
│   │   └── ImageItem.tsx
│   ├── DetailHeaderQuickLinks/
│   │   ├── DetailHeaderQuickLinks.tsx
│   │   ├── AnchoringLink.tsx
│   │   ├── ShareLink.tsx
│   │   └── WishLink.tsx
│   └── DetailHeaderSummary/
├── DetailTab/                         # 탭 도메인
│   ├── DetailTab.tsx
│   ├── useTabScroll.ts               # 관련 훅도 같은 폴더에
│   └── types.ts
├── DetailBottomCTABar/                # CTA 도메인
│   ├── DetailBottomCTABar.tsx
│   └── PriceSummary.tsx
└── hooks/                             # feature 전용 훅
    ├── useProductDetailLog.ts
    └── useTabNavigation.ts
```

**규칙:**
- 각 feature 폴더 내에 관련 컴포넌트, 훅, 타입을 함께 배치
- 해당 feature에서만 사용하는 훅은 `features/{feature}/hooks/`에 배치
- 전역적으로 사용하는 훅만 `src/hooks/`에 배치

### 🔧 방법론: DTO와 Enum 응집

#### ✅ Good: 관련 타입들을 models 파일에서 함께 관리

```tsx
// models/SimDto.ts

// Enum 정의
export enum ESimStatusEnum {
  NONE = 'NONE',
  PENDING = 'PENDING',
  ISSUING = 'ISSUING',
  LOCAL_ISSUED = 'LOCAL_ISSUED',
  LOCAL_FAILED = 'LOCAL_FAILED',
  ROAMING_ISSUED = 'ROAMING_ISSUED',
  // ...
}

export enum ShortcutButtonActionTypeEnum {
  WISH = 'WISH',
  SHARE = 'SHARE',
  MESSAGE = 'MESSAGE',
  ANCHORING = 'ANCHORING',
}

// 관련 Response 타입
export interface ProductDetailHeaderResponse {
  shortcutButtons: ProductDetailHeaderShortcutButtonsResponse[];
  // ...
}

export interface ProductDetailHeaderShortcutButtonsResponse {
  key: string;
  actionType: ShortcutButtonActionTypeEnum;  // Enum 참조
  text: string;
  iconUrl: string;
}
```

> ⚠️ **주의**: 가독성과 응집도는 서로 상충할 수 있습니다.
> - 함께 수정되지 않으면 오류가 발생할 수 있는 경우 → 응집도 우선 (공통화, 추상화)
> - 위험성이 높지 않은 경우 → 가독성 우선 (코드 중복 허용)

---

## 4. 결합도 (Coupling)

코드를 수정했을 때의 영향 범위를 말합니다. 영향 범위가 적어서 변경에 따른 범위를 예측할 수 있는 코드가 수정하기 쉬운 코드입니다.

### 체크리스트

- [ ] 하나의 함수/Hook이 하나의 책임만 가지고 있는가?
- [ ] 페이지 전체의 상태를 한 곳에서 관리하지 않는가?
- [ ] 적절한 수준의 중복 코드를 허용하여 결합도를 낮추고 있는가?
- [ ] Props Drilling이 발생하지 않는가? (Context, 상태 관리 라이브러리 활용)

### 🔧 방법론: 단일 책임 Hook

#### ❌ Bad: 여러 책임을 가진 Hook

```tsx
function useProductDetail(gid: number) {
  const [isWished, setIsWished] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  
  const { data: header } = useProductDetailHeader(gid);
  const { data: partitions } = useProductDetailPartitions(gid);
  const { data: coupon } = useProductDetailCoupon(gid);
  
  const handleWish = () => { /* ... */ };
  const handleShare = () => { /* ... */ };
  const sendLog = () => { /* ... */ };
  
  return { header, partitions, coupon, isWished, shareOpen, handleWish, handleShare, sendLog };
}
```

#### ✅ Good: 책임별로 분리된 Hook

```tsx
// hooks/useBooleanState.ts - 재사용 가능한 상태 Hook
export const useBooleanState = (defaultValue = false) => {
  const [bool, setBool] = useState(defaultValue);
  
  const setTrue = useCallback(() => setBool(true), []);
  const setFalse = useCallback(() => setBool(false), []);
  const toggle = useCallback(() => setBool((b) => !b), []);
  
  return [bool, setTrue, setFalse, toggle] as const;
};

// 각 기능별 Hook을 개별적으로 사용
function DetailEntry({ gid }: Props) {
  // 데이터 패칭은 개별 쿼리 훅 사용
  const { data: header } = useProductDetailHeader(gid);
  const { data: partitions } = useProductDetailPartitions(gid);
  
  // UI 상태는 개별 상태 훅 사용
  const [isShareOpen, openShare, closeShare] = useBooleanState(false);
  
  return (/* ... */);
}
```

### 🔧 방법론: LoggerBoundary를 통한 로깅 결합도 낮추기

#### ✅ Good: Context 기반 로깅 시스템

```tsx
// components/logger/LoggerBoundary.tsx 활용

// 1. 페이지 레벨에서 로거 초기화
function ProductDetailPage({ gid }: Props) {
  return (
    <LoggerBoundary.Init
      initialEntry={EntryTypeEnum.PRODUCT_DETAIL}
      baseLog={{
        pageCategory: WeblogPageCategory.ESIM_DETAIL,
        screenName: WeblogScreenName.ESIM_PRODUCT_DETAIL,
        gid,
      }}
    >
      <LoggerBoundary.PageView eventName={WeblogEventName.ESIM_OFFER_DETAIL} />
      <DetailEntry gid={gid} />
    </LoggerBoundary.Init>
  );
}

// 2. 하위 컴포넌트에서는 LoggerBoundary 컴포넌트만 사용
function DetailHeaderQuickLinks({ shortcutButtons, tabScrollTo }: Props) {
  return (
    <Container>
      {shortcutButtons.map((shortcutButton) => (
        <LinkContainer key={shortcutButton.key}>
          {match(shortcutButton.actionType)
            .with(ShortcutButtonActionTypeEnum.ANCHORING, (actionType) => (
              // 클릭 로그는 LoggerBoundary.Click으로 래핑
              <LoggerBoundary.Click
                eventName={WeblogEventName.ESIM_DETAIL_SHORTCUT}
                params={{ item_kind: actionType, item_name: shortcutButton.text }}
              >
                <AnchoringLink linkData={shortcutButton} tabScrollTo={tabScrollTo} />
              </LoggerBoundary.Click>
            ))
            .with(ShortcutButtonActionTypeEnum.WISH, (actionType) => (
              <LoggerBoundary.Click
                eventName={WeblogEventName.ESIM_DETAIL_SHORTCUT}
                params={{ item_kind: actionType, item_name: shortcutButton.text }}
              >
                <WishLink linkData={shortcutButton} />
              </LoggerBoundary.Click>
            ))
            .exhaustive()}
        </LinkContainer>
      ))}
    </Container>
  );
}

// 3. Hook으로 로그 전송이 필요한 경우
function useProductAction() {
  const { sendClickLog, sendImpressionLog, canLog } = useLogger();
  
  const handleAction = useCallback((actionName: string) => {
    sendClickLog({ 
      event_name: WeblogEventName.ESIM_ACTION, 
      item_name: actionName 
    });
  }, [sendClickLog]);
  
  return { handleAction };
}
```

**LoggerBoundary 장점:**
- 로깅 로직이 컴포넌트에서 분리됨
- baseLog가 Context로 전파되어 Props Drilling 없음
- 진입점에 따른 로깅 차단 기능 내장

### 🔧 방법론: 타입 안전한 Factory 패턴

#### ✅ Good: createLoggerBoundary Factory

```tsx
// 도메인별 타입이 지정된 Logger 생성
type SearchResultLog = BaseLog & {
  countryCode: string;
  searchKeyword: string;
};

const SearchLogger = createLoggerBoundary<SearchResultLog>();

// 타입 안전하게 사용
<SearchLogger.Init
  initialEntry={EntryTypeEnum.SEARCH_RESULT}
  baseLog={{
    pageCategory: WeblogPageCategory.ESIM_MAIN,
    screenName: WeblogScreenName.ESIM_SEARCH_RESULT,
    countryCode: 'KR',           // 타입 체크됨
    searchKeyword: '일본',        // 타입 체크됨
  }}
>
  <SearchLogger.PageView eventName={WeblogEventName.ESIM_SEARCH_RESULT} />
  <SearchResultList />
</SearchLogger.Init>
```

---

## 5. 미시적 관점의 고려

실무에서 자주 마주치는 세부적인 코딩 스타일과 패턴에 대한 고려사항입니다.

### 조건부 렌더링 처리
- [ ] `&&`, `? () : ()` 연산자와 `<If />` 같은 선언적 컴포넌트 중 일관된 방식을 사용하는가?
- [ ] TypeScript에서 타입 좁히기(Type Narrowing)가 제대로 동작하는가?
- [ ] Short-circuit 평가가 의도대로 동작하는가?

### 전역 상태 사용 기준
- [ ] props drilling 깊이가 적절한가? (너무 깊으면 전역 상태 고려)
- [ ] 서버 상태, 라우팅 상태, 폼 상태, UI 상태가 적절히 구분되어 관리되는가?
- [ ] Context API를 단순 props drilling 해결책으로만 사용하고 있지 않은가?

### TypeScript 타입 정의
- [ ] `enum` vs `as const` 중 프로젝트 컨벤션에 맞는 방식을 사용하는가?
- [ ] 트리 셰이킹과 번들 크기를 고려했는가?

### 코드 스타일 일관성
- [ ] if문의 중괄호 `{}` 사용이 일관적인가?
- [ ] Diff 최소화를 고려한 코드 포맷팅인가?
- [ ] ESLint, Biome 등 린터 설정을 따르고 있는가?

### 암묵적 타입 변환
- [ ] `if (!value)` 사용 시 `""`, `undefined`, `null`, `0` 중 의도한 조건만 포함하는가?
- [ ] 특정 값만 체크해야 하는 경우 명시적 비교(`=== undefined`, `=== ""`)를 사용하는가?
- [ ] `isNil()`, `isString()` 같은 헬퍼 함수 활용을 고려했는가?


---

## 6. 리뷰 출력 형식 (권장)

코드 리뷰 시 아래 형식을 따라 피드백을 제공합니다.

### 📋 리뷰 템플릿

```markdown
## 요약
[변경 사항에 대한 간략한 설명]

## 코드 품질 기준별 피드백

### 가독성
- ⚠️ [개선 필요한 점]

### 예측 가능성
- ⚠️ [개선 필요한 점]

### 응집도
- ⚠️ [개선 필요한 점]

### 결합도
- ⚠️ [개선 필요한 점]

## 🚨 리스크 상위 3개
1. [심각도: 높음/중간/낮음] - [설명]
2. [심각도: 높음/중간/낮음] - [설명]
3. [심각도: 높음/중간/낮음] - [설명]

## 📁 파일별 코멘트

### `src/features/productDetails/DetailHeader.tsx` (L45-60)
[코멘트 내용]

### `src/queries/sim/useSearchProductDetail.ts` (L12-25)
[코멘트 내용]

## 💡 개선 제안

### 제안 1: [제목]
```diff
- const result = status === 'A' ? <A /> : status === 'B' ? <B /> : null;
+ const result = match(status)
+   .with('A', () => <A />)
+   .with('B', () => <B />)
+   .otherwise(() => null);
```

```

---

## 부록: 유틸리티 컴포넌트 레퍼런스

### Show 컴포넌트

```tsx
// 조건부 렌더링
<Show when={isLoggedIn}>
  <WelcomeMessage />
</Show>

// when 값을 children에서 사용
<Show when={item}>
  {(item) => <ItemRenderer item={item} />}
</Show>

// 타입이 보장된 데이터를 render prop으로 사용
<Show when={isLoggedIn} params={user}>
  {(user) => <UserProfile user={user} />}
</Show>
```

### SwitchCase 컴포넌트

```tsx
<SwitchCase
  value={status}
  caseBy={{
    pending: <PendingView />,
    active: <ActiveView />,
    expired: <ExpiredView />,
  }}
  defaultComponent={<DefaultView />}
/>
```

### ts-pattern match

```tsx
import { match, P } from 'ts-pattern';

// 기본 사용
match(value)
  .with('A', () => <ComponentA />)
  .with('B', () => <ComponentB />)
  .otherwise(() => null);

// exhaustive 체크 (모든 케이스 처리 강제)
match(enumValue)
  .with(Enum.A, () => <A />)
  .with(Enum.B, () => <B />)
  .exhaustive();

// 패턴 매칭
match(response)
  .with({ status: 'success', data: P.select() }, (data) => <Success data={data} />)
  .with({ status: 'error' }, () => <Error />)
  .exhaustive();
```

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2026-01-19 | 1.0.0 | 최초 작성 |
