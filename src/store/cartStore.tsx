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
  /** 손님 선택 — 이 라인을 포장으로 받을지. 기본 false (매장). */
  isTakeout: boolean
}

interface CartState {
  items: CartItem[]
  hydrated: boolean
}

type CartAction =
  | { type: 'HYDRATE'; items: CartItem[] }
  | { type: 'ADD'; item: CartItem }
  | { type: 'REMOVE'; menuId: string }
  | { type: 'UPDATE_QTY'; menuId: string; quantity: number }
  | { type: 'SET_ITEM_TAKEOUT'; menuId: string; value: boolean }
  | { type: 'CLEAR' }

interface CartContextValue {
  items: CartItem[]
  hydrated: boolean
  totalAmount: number
  totalCount: number
  addItem: (item: CartItem) => void
  removeItem: (menuId: string) => void
  updateQuantity: (menuId: string, quantity: number) => void
  setItemTakeout: (menuId: string, value: boolean) => void
  clear: () => void
}

// ==================== Reducer ====================

const initialState: CartState = { items: [], hydrated: false }

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.items, hydrated: true }

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

    case 'REMOVE':
      return { ...state, items: state.items.filter((i) => i.menuId !== action.menuId) }

    case 'SET_ITEM_TAKEOUT':
      return {
        ...state,
        items: state.items.map((i) => {
          if (i.menuId !== action.menuId) return i
          // 포장 불가 메뉴는 항상 false 강제
          if (i.acceptsTakeout === false) return { ...i, isTakeout: false }
          return { ...i, isTakeout: action.value }
        }),
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
      return { ...state, items: [] }

    default:
      return state
  }
}

// ==================== Persistence ====================

const STORAGE_KEY = 'moosan-cart-v1'

function loadFromStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (i): i is Omit<CartItem, 'isTakeout'> & { isTakeout?: unknown } =>
          typeof i?.menuId === 'string' &&
          typeof i?.boothId === 'string' &&
          typeof i?.boothNo === 'string' &&
          typeof i?.boothName === 'string' &&
          typeof i?.menuName === 'string' &&
          typeof i?.price === 'number' &&
          typeof i?.quantity === 'number' &&
          i.quantity > 0,
      )
      .map((i) => ({
        ...i,
        // 구버전(boothTakeout 맵 시절) localStorage 호환 — isTakeout 누락 시 false
        isTakeout: i.isTakeout === true,
      }))
  } catch {
    return []
  }
}

function saveToStorage(items: CartItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
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
    const items = loadFromStorage()
    dispatch({ type: 'HYDRATE', items })
  }, [])

  // items 변경 시 persist (hydrate 완료 후에만)
  useEffect(() => {
    if (!state.hydrated) return
    saveToStorage(state.items)
  }, [state.items, state.hydrated])

  const addItem = useCallback((item: CartItem) => {
    dispatch({ type: 'ADD', item })
  }, [])

  const removeItem = useCallback((menuId: string) => {
    dispatch({ type: 'REMOVE', menuId })
  }, [])

  const updateQuantity = useCallback((menuId: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QTY', menuId, quantity })
  }, [])

  const setItemTakeout = useCallback((menuId: string, value: boolean) => {
    dispatch({ type: 'SET_ITEM_TAKEOUT', menuId, value })
  }, [])

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' })
  }, [])

  const totalAmount = useMemo(
    () => state.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [state.items],
  )

  const totalCount = useMemo(
    () => state.items.reduce((sum, i) => sum + i.quantity, 0),
    [state.items],
  )

  const value = useMemo<CartContextValue>(
    () => ({
      items: state.items,
      hydrated: state.hydrated,
      totalAmount,
      totalCount,
      addItem,
      removeItem,
      updateQuantity,
      setItemTakeout,
      clear,
    }),
    [
      state.items,
      state.hydrated,
      totalAmount,
      totalCount,
      addItem,
      removeItem,
      updateQuantity,
      setItemTakeout,
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
