import { useParams } from 'react-router-dom'
import ApplySection from './sections/ApplySection'

export default function ApplyPage() {
  const { slug } = useParams<{ slug: string }>()
  return <ApplySection programSlug={slug} />
}
