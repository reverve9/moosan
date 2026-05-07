import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'

// ==================== Types ====================

export interface CartItem {
  menuId: string
  boothId: string
  boothNo: string
  boothName: string
  menuName: string
  price: number
  quantity: number
  imageUrl?: string
  /** 메뉴 단위 포장 허용 여부 (food_menus.accepts_takeout). 미설정 시 true 로 간주. */
  acceptsTakeout?: boolean
}

/** 부스별 포장 선택 — boothId → true(포장) / false(매장). 미설정 시 매장. */
export type BoothTakeoutMap = Record<string, boolean>

interface CartState {
  items: CartItem[]
  boothTakeout: BoothTakeoutMap
  hydrated: boolean
}

type CartAction =
  | { type: 'HYDRATE'; items: CartItem[]; boothTakeout: BoothTakeoutMap }
  | { type: 'ADD'; item: CartItem }
  | { type: 'REMOVE'; menuId: string }
  | { type: 'UPDATE_QTY'; menuId: string; quantity: number }
  | { type: 'SET_BOOTH_TAKEOUT'; boothId: string; value: boolean }
  | { type: 'CLEAR' }

interface CartContextValue {
  items: CartItem[]
  boothTakeout: BoothTakeoutMap
  hydrated: boolean
  totalAmount: number
  totalCount: number
  addItem: (item: CartItem) => void
  removeItem: (menuId: string) => void
  updateQuantity: (menuId: string, quantity: number) => void
  setBoothTakeout: (boothId: string, value: boolean) => void
  clear: () => void
}

// ==================== Reducer ====================

const initialState: CartState = { items: [], boothTakeout: {}, hydrated: false }

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.items, boothTakeout: action.boothTakeout, hydrated: true }

    case 'ADD': {
      const existing = state.items.find((i) => i.menuId === action.item.menuId)
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.menuId === action.item.menuId
              ? { ...i, quantity: i.quantity + action.item.quantity }
              : i,
          ),
        }
      }
      return { ...state, items: [...state.items, action.item] }
    }

    case 'REMOVE': {
      const remaining = state.items.filter((i) => i.menuId !== action.menuId)
      // 해당 부스 아이템이 다 빠지면 takeout 선택도 정리
      const removedItem = state.items.find((i) => i.menuId === action.menuId)
      const stillHasBooth =
        removedItem && remaining.some((i) => i.boothId === removedItem.boothId)
      const nextTakeout =
        removedItem && !stillHasBooth
          ? Object.fromEntries(
              Object.entries(state.boothTakeout).filter(
                ([id]) => id !== removedItem.boothId,
              ),
            )
          : state.boothTakeout
      return { ...state, items: remaining, boothTakeout: nextTakeout }
    }

    case 'SET_BOOTH_TAKEOUT':
      return {
        ...state,
        boothTakeout: { ...state.boothTakeout, [action.boothId]: action.value },
      }

    case 'UPDATE_QTY': {
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter((i) => i.menuId !== action.menuId),
        }
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.menuId === action.menuId ? { ...i, quantity: action.quantity } : i,
        ),
      }
    }

    case 'CLEAR':
      return { ...state, items: [], boothTakeout: {} }

    default:
      return state
  }
}

// ==================== Persistence ====================

const STORAGE_KEY = 'moosan-cart-v1'
const TAKEOUT_KEY = 'moosan-cart-takeout-v1'

function loadFromStorage(): { items: CartItem[]; boothTakeout: BoothTakeoutMap } {
  let items: CartItem[] = []
  let boothTakeout: BoothTakeoutMap = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        items = parsed.filter(
          (i): i is CartItem =>
            typeof i?.menuId === 'string' &&
            typeof i?.boothId === 'string' &&
            typeof i?.boothNo === 'string' &&
            typeof i?.boothName === 'string' &&
            typeof i?.menuName === 'string' &&
            typeof i?.price === 'number' &&
            typeof i?.quantity === 'number' &&
            i.quantity > 0,
        )
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(TAKEOUT_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        boothTakeout = Object.fromEntries(
          Object.entries(parsed).filter(([, v]) => typeof v === 'boolean'),
        ) as BoothTakeoutMap
      }
    }
  } catch {
    /* ignore */
  }
  return { items, boothTakeout }
}

function saveToStorage(items: CartItem[], boothTakeout: BoothTakeoutMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    localStorage.setItem(TAKEOUT_KEY, JSON.stringify(boothTakeout))
  } catch {
    /* quota exceeded / privacy mode — silent */
  }
}

// ==================== Context + Provider ====================

const CartContext = createContext<CartContextValue | null>(null)

interface CartProviderProps {
  children: ReactNode
}

export function CartProvider({ children }: CartProviderProps) {
  const [state, dispatch] = useReducer(cartReducer, initialState)

  // 마운트 시 localStorage 에서 hydrate
  useEffect(() => {
    const loaded = loadFromStorage()
    dispatch({ type: 'HYDRATE', items: loaded.items, boothTakeout: loaded.boothTakeout })
  }, [])

  // items / boothTakeout 변경 시 persist (hydrate 완료 후에만)
  useEffect(() => {
    if (!state.hydrated) return
    saveToStorage(state.items, state.boothTakeout)
  }, [state.items, state.boothTakeout, state.hydrated])

  const addItem = useCallback((item: CartItem) => {
    dispatch({ type: 'ADD', item })
  }, [])

  const removeItem = useCallback((menuId: string) => {
    dispatch({ type: 'REMOVE', menuId })
  }, [])

  const updateQuantity = useCallback((menuId: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QTY', menuId, quantity })
  }, [])

  const setBoothTakeout = useCallback((boothId: string, value: boolean) => {
    dispatch({ type: 'SET_BOOTH_TAKEOUT', boothId, value })
  }, [])

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' })
  }, [])

  // 포장 모드 + acceptsTakeout=false 아이템은 결제·합계에서 제외
  const isItemActive = useCallback(
    (i: CartItem) =>
      !(state.boothTakeout[i.boothId] === true && i.acceptsTakeout === false),
    [state.boothTakeout],
  )

  const totalAmount = useMemo(
    () =>
      state.items.reduce(
        (sum, i) => (isItemActive(i) ? sum + i.price * i.quantity : sum),
        0,
      ),
    [state.items, isItemActive],
  )

  const totalCount = useMemo(
    () =>
      state.items.reduce((sum, i) => (isItemActive(i) ? sum + i.quantity : sum), 0),
    [state.items, isItemActive],
  )

  const value = useMemo<CartContextValue>(
    () => ({
      items: state.items,
      boothTakeout: state.boothTakeout,
      hydrated: state.hydrated,
      totalAmount,
      totalCount,
      addItem,
      removeItem,
      updateQuantity,
      setBoothTakeout,
      clear,
    }),
    [
      state.items,
      state.boothTakeout,
      state.hydrated,
      totalAmount,
      totalCount,
      addItem,
      removeItem,
      updateQuantity,
      setBoothTakeout,
      clear,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// ==================== Hook ====================

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error('useCart must be used within <CartProvider>')
  }
  return ctx
}
