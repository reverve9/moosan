import styles from './AboutSection.module.css'

export default function AboutSection() {
  return (
    <section id="about" className={styles.about}>
      <div className={styles.container}>
        <h2 className={styles.title}>축제 소개</h2>
        <p className={styles.subtitle}>설악의 자연과 문화가 만나는 순간</p>
        <div className={styles.body}>
          <p>
            설악무산문화축전은 만해 한용운 선생의 사상을 기리며,
            설악산의 웅장한 자연 속에서 문화와 예술의 가치를 나누는 축제입니다.
          </p>
          <p>
            청소년과 어린이들이 문학, 미술, 음악, 무용 등
            다양한 예술 분야에서 재능을 펼칠 수 있는 장을 마련합니다.
          </p>
        </div>
      </div>
    </section>
  )
}
