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
  boothName: string
  menuName: string
  price: number
  quantity: number
  imageUrl?: string
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
  | { type: 'CLEAR' }

interface CartContextValue {
  items: CartItem[]
  hydrated: boolean
  totalAmount: number
  totalCount: number
  addItem: (item: CartItem) => void
  removeItem: (menuId: string) => void
  updateQuantity: (menuId: string, quantity: number) => void
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
      return {
        ...state,
        items: state.items.filter((i) => i.menuId !== action.menuId),
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
    // 최소한의 shape 검증 — 잘못된 데이터 무시
    return parsed.filter(
      (i): i is CartItem =>
        typeof i?.menuId === 'string' &&
        typeof i?.boothId === 'string' &&
        typeof i?.boothName === 'string' &&
        typeof i?.menuName === 'string' &&
        typeof i?.price === 'number' &&
        typeof i?.quantity === 'number' &&
        i.quantity > 0,
    )
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
    dispatch({ type: 'HYDRATE', items: loadFromStorage() })
  }, [])

  // items 변경 시 persist (hydrate 완료 후에만 — 빈 상태로 덮어쓰기 방지)
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
      clear,
    }),
    [state.items, state.hydrated, totalAmount, totalCount, addItem, removeItem, updateQuantity, clear],
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
