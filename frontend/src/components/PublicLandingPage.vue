<template>
  <div
    ref="landingRoot"
    class="landing-page"
    :lang="currentLocale"
    :class="{ 'is-english': currentLocale === 'en-US' }"
  >
    <Transition name="landing-intro">
      <div
        v-if="showIntro"
        class="landing-intro"
        role="status"
        aria-live="polite"
        :aria-label="t('landing.loader.aria')"
      >
        <div class="landing-intro__glow landing-intro__glow--one"></div>
        <div class="landing-intro__glow landing-intro__glow--two"></div>
        <div class="landing-intro__content">
          <div class="landing-intro__book" aria-hidden="true">
            <span class="landing-intro__back"></span>
            <span class="landing-intro__page landing-intro__page--one"></span>
            <span class="landing-intro__page landing-intro__page--two"></span>
            <span class="landing-intro__page landing-intro__page--three"></span>
            <span class="landing-intro__cover">
              <img src="/favicon.svg" alt="" />
            </span>
          </div>
          <div class="landing-intro__wordmark">
            <span>DrewesLogistics</span>
            <small>CARGO OPERATIONS SUITE</small>
          </div>
          <p>{{ t("landing.loader.copy") }}</p>
          <div class="landing-intro__progress" aria-hidden="true"><i></i></div>
        </div>
        <button type="button" class="landing-intro__skip" @click="finishIntro">
          {{ t("landing.loader.skip") }}
        </button>
      </div>
    </Transition>

    <header class="landing-header">
      <a class="landing-brand" href="#landing-top" :aria-label="t('landing.brandAria')">
        <span class="landing-brand__mark" aria-hidden="true">
          <img src="/favicon.svg" alt="" />
        </span>
        <span class="landing-brand__copy">
          <strong>DrewesLogistics</strong>
          <small>Cargo Operations Suite</small>
        </span>
      </a>

      <nav class="landing-nav" :aria-label="t('landing.nav.aria')">
        <a href="#landing-top">{{ t("landing.nav.home") }}</a>
        <details class="landing-nav__dropdown">
          <summary>
            {{ t("landing.nav.features") }}
            <span aria-hidden="true"></span>
          </summary>
          <div class="landing-nav__menu">
            <a
              :href="platformEntryPath"
              target="_blank"
              rel="noopener noreferrer"
              @click="navigateWithTransition($event, platformEntryPath)"
            >
              <el-icon><Box /></el-icon>
              <span>
                <strong>{{ t("landing.capabilities.planning.title") }}</strong>
                <small>{{ t("landing.status.available") }}</small>
              </span>
            </a>
            <a href="#landing-roadmap" @click="navigateWithTransition($event, '#landing-roadmap')">
              <el-icon><Ship /></el-icon>
              <span>
                <strong>{{ t("landing.capabilities.booking.title") }}</strong>
                <small>{{ t("landing.status.planned") }}</small>
              </span>
            </a>
            <a href="#landing-roadmap" @click="navigateWithTransition($event, '#landing-roadmap')">
              <el-icon><Connection /></el-icon>
              <span>
                <strong>{{ t("landing.capabilities.erp.title") }}</strong>
                <small>{{ t("landing.status.planned") }}</small>
              </span>
            </a>
          </div>
        </details>
        <a
          class="landing-nav__tracking"
          :href="trackingEntryPath"
          target="_blank"
          rel="noopener noreferrer"
          @click="navigateWithTransition($event, trackingEntryPath)"
        >
          {{ t("landing.nav.tracking") }}
          <span>{{ t("landing.status.publicFree") }}</span>
        </a>
        <a href="#landing-company">{{ t("landing.nav.about") }}</a>
      </nav>

      <div class="landing-header__actions">
        <LanguageSwitcher class="landing-language" />
        <a
          class="landing-entry-button"
          :href="platformEntryPath"
          target="_blank"
          rel="noopener noreferrer"
          @click="navigateWithTransition($event, platformEntryPath)"
        >
          <span>{{ platformEntryLabel }}</span>
          <el-icon><ArrowRight /></el-icon>
        </a>
      </div>
    </header>

    <main>
      <section
        id="landing-top"
        class="landing-hero"
        @mouseenter="stopAutoplay"
        @mouseleave="startAutoplay"
        @focusin="stopAutoplay"
        @focusout="startAutoplay"
      >
        <Transition name="landing-hero-page" mode="out-in">
          <article
            :key="currentSlide.id"
            class="landing-hero__slide"
            :style="{ backgroundImage: `url(${currentSlide.image})` }"
          >
            <div class="landing-hero__wash"></div>
            <div class="landing-hero__angle landing-hero__angle--left"></div>
            <div class="landing-hero__angle landing-hero__angle--right"></div>
            <div class="landing-hero__grid" aria-hidden="true"></div>

            <div class="landing-hero__inner">
              <div class="landing-hero__content">
                <p class="landing-kicker">
                  <span></span>
                  {{ currentSlide.kicker }}
                </p>
                <h1>{{ currentSlide.title }}</h1>
                <p class="landing-hero__description">{{ currentSlide.description }}</p>
                <div class="landing-hero__actions">
                  <a
                    class="landing-button landing-button--primary"
                    :href="currentSlide.primaryHref"
                    target="_blank"
                    rel="noopener noreferrer"
                    @click="navigateWithTransition($event, currentSlide.primaryHref)"
                  >
                    {{ currentSlide.primaryLabel }}
                    <el-icon><ArrowRight /></el-icon>
                  </a>
                  <a class="landing-button landing-button--ghost" href="#landing-capabilities">
                    {{ t("landing.hero.explore") }}
                  </a>
                </div>
              </div>
            </div>
          </article>
        </Transition>

        <div class="landing-hero__footer">
          <div class="landing-hero__pagination" :aria-label="t('landing.hero.paginationAria')">
            <button
              v-for="(slide, index) in slides"
              :key="slide.id"
              type="button"
              :class="{ active: activeSlideIndex === index }"
              :aria-label="t('landing.hero.goToSlide', { index: index + 1 })"
              :aria-pressed="activeSlideIndex === index"
              @click="goToSlide(index)"
            >
              <span>{{ String(index + 1).padStart(2, "0") }}</span>
              <i></i>
            </button>
          </div>
          <div class="landing-hero__arrows">
            <button type="button" :aria-label="t('landing.hero.previous')" @click="previousSlide">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <button type="button" :aria-label="t('landing.hero.next')" @click="nextSlide">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </section>

      <section id="landing-capabilities" class="landing-capabilities" :aria-label="t('landing.capabilities.aria')">
        <div class="landing-capabilities__layout">
          <div class="landing-capabilities__grid">
            <a
              v-for="(item, index) in capabilities"
              :key="item.id"
              class="landing-capability-card landing-reveal"
              :class="[`landing-capability-card--${item.id}`, { 'is-public': item.status === 'public' }]"
              :href="item.href"
              :target="item.opensInNewTab ? '_blank' : undefined"
              :rel="item.opensInNewTab ? 'noopener noreferrer' : undefined"
              :style="{ '--landing-reveal-delay': `${index * 70}ms` }"
              @click="navigateWithTransition($event, item.href)"
            >
              <span class="landing-capability-card__number">{{ item.number }}</span>
              <span v-if="item.id === 'tracking'" class="landing-capability-card__free">FREE</span>
              <span class="landing-capability-card__icon"><el-icon><component :is="item.icon" /></el-icon></span>
              <div class="landing-capability-card__status">
                <i></i>
                {{ item.statusLabel }}
              </div>
              <h2>{{ item.title }}</h2>
              <p>{{ item.description }}</p>
              <span class="landing-capability-card__link">
                {{ item.actionLabel }}
                <el-icon><ArrowRight /></el-icon>
              </span>
            </a>
          </div>
          <aside class="landing-capabilities__aside landing-reveal landing-reveal--delay-1">
            <article>
              <small>{{ t("landing.capabilities.summary.current") }}</small>
              <strong>02 / 04</strong>
              <span>{{ t("landing.capabilities.summary.currentDetail") }}</span>
            </article>
            <a
              :href="trackingEntryPath"
              target="_blank"
              rel="noopener noreferrer"
              @click="navigateWithTransition($event, trackingEntryPath)"
            >
              <small>{{ t("landing.capabilities.summary.tracking") }}</small>
              <strong>ONLINE</strong>
              <span>{{ t("landing.capabilities.summary.trackingDetail") }}</span>
            </a>
          </aside>
        </div>
      </section>

      <section id="landing-about" class="landing-statement">
        <div class="landing-section-heading landing-section-heading--center landing-reveal">
          <p>{{ t("landing.statement.eyebrow") }}</p>
          <h2>{{ t("landing.statement.title") }}</h2>
          <span>{{ t("landing.statement.description") }}</span>
        </div>
        <div class="landing-statement__actions landing-reveal landing-reveal--delay-1">
          <a
            class="landing-pill landing-pill--dark"
            :href="trackingEntryPath"
            target="_blank"
            rel="noopener noreferrer"
            @click="navigateWithTransition($event, trackingEntryPath)"
          >
            <el-icon><Search /></el-icon>
            {{ t("landing.statement.track") }}
          </a>
          <a
            class="landing-pill landing-pill--blue"
            :href="platformEntryPath"
            target="_blank"
            rel="noopener noreferrer"
            @click="navigateWithTransition($event, platformEntryPath)"
          >
            <el-icon><Monitor /></el-icon>
            {{ platformEntryLabel }}
          </a>
        </div>
        <div class="landing-statement__metrics landing-reveal landing-reveal--delay-2">
          <div>
            <strong>02</strong>
            <span>{{ t("landing.statement.metricOnline") }}</span>
          </div>
          <div>
            <strong>01</strong>
            <span>{{ t("landing.statement.metricPublic") }}</span>
          </div>
          <div>
            <strong>04</strong>
            <span>{{ t("landing.statement.metricRoadmap") }}</span>
          </div>
        </div>
      </section>

      <section id="landing-company" class="landing-company">
        <div class="landing-company__intro">
          <div class="landing-company__identity landing-reveal">
            <p class="landing-company__eyebrow">{{ t("landing.company.eyebrow") }}</p>
            <span class="landing-company__international-name">{{ t("landing.company.internationalName") }}</span>
            <h2>{{ t("landing.company.legalName") }}</h2>
            <p class="landing-company__description">{{ t("landing.company.description") }}</p>
            <p class="landing-company__detail">{{ t("landing.company.detail") }}</p>
            <dl class="landing-company__registration">
              <div>
                <dt>{{ t("landing.company.incorporatedLabel") }}</dt>
                <dd>2023-03-16</dd>
              </div>
              <div>
                <dt>{{ t("landing.company.typeLabel") }}</dt>
                <dd>{{ t("landing.company.typeValue") }}</dd>
              </div>
              <div>
                <dt>{{ t("landing.company.industryLabel") }}</dt>
                <dd>{{ t("landing.company.industryValue") }}</dd>
              </div>
            </dl>
            <div class="landing-company__actions">
              <a
                class="landing-button landing-button--company"
                href="#landing-capabilities"
              >
                {{ t("landing.company.platformAction") }}
                <el-icon><ArrowRight /></el-icon>
              </a>
              <span class="landing-company__credit-code">
                {{ t("landing.company.creditCodeLabel") }} · 91310109MACBQ4CP2M
              </span>
            </div>
            <small class="landing-company__source-note">{{ t("landing.company.sourceNote") }}</small>
          </div>

          <div class="landing-company__operations landing-reveal landing-reveal--delay-1" aria-hidden="true">
            <div class="landing-company__operations-head">
              <span>
                <small>{{ t("landing.company.operationsEyebrow") }}</small>
                <strong>{{ t("landing.company.operationsTitle") }}</strong>
              </span>
              <i></i>
            </div>
            <div class="landing-company__operations-route">
              <span class="is-origin"><b>SHA</b><small>{{ t("landing.company.operationsOrigin") }}</small></span>
              <div><i></i><b></b><i></i></div>
              <span><b>PORT</b><small>{{ t("landing.company.operationsHub") }}</small></span>
              <div><i></i><b></b><i></i></div>
              <span><b>GLOBAL</b><small>{{ t("landing.company.operationsGlobal") }}</small></span>
            </div>
            <div class="landing-company__operations-modes">
              <span><el-icon><Ship /></el-icon> SEA</span>
              <span><el-icon><Connection /></el-icon> ROAD</span>
              <span><el-icon><Box /></el-icon> AIR</span>
            </div>
            <div class="landing-company__operations-foot">
              <span>{{ t("landing.company.operationsStatus") }}</span>
              <strong>ACTIVE</strong>
            </div>
            <div class="landing-company__operations-float landing-company__operations-float--tracking">
              <small>CARGO TRACKING</small>
              <strong>{{ t("landing.status.publicFree") }}</strong>
            </div>
            <div class="landing-company__operations-float landing-company__operations-float--planning">
              <small>LOAD PLANNING</small>
              <strong>{{ t("landing.status.available") }}</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="landing-services">
        <div class="landing-services__inner">
          <div class="landing-services__heading-orbit landing-reveal">
            <div class="landing-section-heading">
              <p>{{ t("landing.company.servicesEyebrow") }}</p>
              <h2>{{ t("landing.company.servicesTitle") }}</h2>
              <span>{{ t("landing.company.servicesDescription") }}</span>
            </div>
          </div>
          <div class="landing-company__service-timeline" role="list">
            <article
              v-for="(service, index) in companyServices"
              :key="service.id"
              class="landing-company__service-card landing-reveal"
              role="listitem"
              :style="{
                '--landing-reveal-delay': `${(index % 3) * 90}ms`,
                '--service-index': index
              }"
            >
              <span class="landing-company__service-icon"><el-icon><component :is="service.icon" /></el-icon></span>
              <div>
                <small>{{ service.number }}</small>
                <h3>{{ service.title }}</h3>
                <p>{{ service.description }}</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="landing-roadmap" class="landing-roadmap">
        <div class="landing-roadmap__visual landing-reveal" aria-hidden="true">
          <div class="landing-roadmap__orb landing-roadmap__orb--one"></div>
          <div class="landing-roadmap__orb landing-roadmap__orb--two"></div>
          <div class="landing-roadmap__console">
            <div class="landing-roadmap__console-head">
              <span>DrewesLogistics / LIVE OPERATIONS</span>
              <i></i>
            </div>
            <div class="landing-roadmap__route-line">
              <span>01</span><i></i><span>02</span><i></i><span>03</span><i></i><span>04</span>
            </div>
            <div class="landing-roadmap__modules">
              <div class="is-live"><el-icon><Box /></el-icon><span>LOAD</span></div>
              <div class="is-public"><el-icon><Search /></el-icon><span>TRACK</span></div>
              <div><el-icon><Ship /></el-icon><span>BOOK</span></div>
              <div><el-icon><Connection /></el-icon><span>ERP</span></div>
            </div>
            <div class="landing-roadmap__console-foot">
              <span>{{ t("landing.roadmap.currentLabel") }}</span>
              <strong>2 / 4</strong>
            </div>
          </div>
        </div>

        <div class="landing-roadmap__content landing-reveal landing-reveal--delay-1">
          <div class="landing-section-heading">
            <p>{{ t("landing.roadmap.eyebrow") }}</p>
            <h2>{{ t("landing.roadmap.title") }}</h2>
            <span>{{ t("landing.roadmap.description") }}</span>
          </div>
          <div class="landing-roadmap__stages">
            <div class="is-current">
              <span>{{ t("landing.roadmap.currentLabel") }}</span>
              <strong>{{ t("landing.roadmap.currentTitle") }}</strong>
              <p>{{ t("landing.roadmap.currentDescription") }}</p>
            </div>
            <div>
              <span>{{ t("landing.roadmap.nextLabel") }}</span>
              <strong>{{ t("landing.roadmap.nextTitle") }}</strong>
              <p>{{ t("landing.roadmap.nextDescription") }}</p>
            </div>
          </div>
          <a
            class="landing-text-link"
            :href="platformEntryPath"
            target="_blank"
            rel="noopener noreferrer"
            @click="navigateWithTransition($event, platformEntryPath)"
          >
            {{ t("landing.roadmap.viewWorkspaces") }}
            <el-icon><ArrowRight /></el-icon>
          </a>
        </div>
      </section>

    </main>

    <footer class="landing-footer">
      <div class="landing-footer__main">
        <div class="landing-footer__brand">
          <span class="landing-brand__mark" aria-hidden="true"><img src="/favicon.svg" alt="" /></span>
          <div>
            <strong>DrewesLogistics</strong>
            <p>{{ t("landing.footer.tagline") }}</p>
            <span>{{ t("landing.company.legalName") }}</span>
          </div>
        </div>
        <div class="landing-footer__column">
          <h3>{{ t("landing.footer.quickLinks") }}</h3>
          <a href="#landing-capabilities">{{ t("landing.nav.features") }}</a>
          <a href="#landing-company">{{ t("landing.nav.about") }}</a>
          <a
            :href="trackingEntryPath"
            target="_blank"
            rel="noopener noreferrer"
            @click="navigateWithTransition($event, trackingEntryPath)"
          >Cargo Tracking</a>
          <a
            :href="platformEntryPath"
            target="_blank"
            rel="noopener noreferrer"
            @click="navigateWithTransition($event, platformEntryPath)"
          >{{ t("landing.footer.signIn") }}</a>
        </div>
        <div class="landing-footer__column landing-footer__registration">
          <h3>{{ t("landing.footer.registrationTitle") }}</h3>
          <p><span>{{ t("landing.company.incorporatedLabel") }}</span><strong>2023-03-16</strong></p>
          <p><span>{{ t("landing.footer.termLabel") }}</span><strong>{{ t("landing.footer.termValue") }}</strong></p>
          <p><span>{{ t("landing.company.typeLabel") }}</span><strong>{{ t("landing.company.typeValue") }}</strong></p>
          <p><span>{{ t("landing.company.industryLabel") }}</span><strong>{{ t("landing.company.industryValue") }}</strong></p>
        </div>
        <div class="landing-footer__column landing-footer__contact">
          <h3>{{ t("landing.footer.contactTitle") }}</h3>
          <p><span>{{ t("landing.company.creditCodeLabel") }}</span>91310109MACBQ4CP2M</p>
          <p><span>{{ t("landing.footer.registeredAddressLabel") }}</span>{{ t("landing.footer.registeredAddress") }}</p>
          <p><span>{{ t("landing.footer.authorityLabel") }}</span>{{ t("landing.footer.authority") }}</p>
        </div>
      </div>
      <div class="landing-footer__bottom">
        <span>{{ t("landing.footer.copyright") }}</span>
        <span>{{ t("landing.footer.disclaimer") }}</span>
      </div>
    </footer>

    <SystemWaitOverlay
      :visible="isPageLeaving"
      :message="t('landing.transition.copy')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Connection,
  Monitor,
  OfficeBuilding,
  Search,
  Ship
} from "@element-plus/icons-vue";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import SystemWaitOverlay from "./SystemWaitOverlay.vue";
import { currentLocale, t } from "../i18n";

const props = defineProps<{
  currentUser?: { role?: string; username?: string; displayName?: string } | null;
}>();

const INTRO_STORAGE_KEY = "dreweslogistics-public-landing-intro-v1";
const trackingEntryPath = import.meta.env.VITE_TRACKING_WORKBENCH_URL || "/tracking/";

function introWasSeen() {
  try {
    return sessionStorage.getItem(INTRO_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const showIntro = ref(!introWasSeen());
const activeSlideIndex = ref(0);
const reducedMotion = ref(false);
const landingRoot = ref<HTMLElement | null>(null);
const isPageLeaving = ref(false);
let introTimer = 0;
let autoplayTimer = 0;
let navigationTimer = 0;
let previousBodyOverflow = "";
let revealObserver: IntersectionObserver | null = null;

const platformEntryPath = computed(() => props.currentUser?.role === "ADMIN" ? "/admin" : "/workbenches");
const platformEntryLabel = computed(() => {
  currentLocale.value;
  if (props.currentUser?.role === "ADMIN") return t("landing.entry.admin");
  if (props.currentUser) return t("landing.entry.open");
  return t("landing.entry.enter");
});

const compactHeroMedia = window.matchMedia("(max-width: 760px)").matches;
const heroImageOptions = compactHeroMedia ? "w=1200&q=62" : "w=1800&q=66";
const slideImages = {
  platform: `https://images.unsplash.com/photo-1724597500306-a4cbb7d1324e?auto=format&fit=crop&${heroImageOptions}`,
  planning: `https://images.unsplash.com/photo-1670121180583-39ab653a071c?auto=format&fit=crop&${heroImageOptions}`,
  tracking: `https://images.unsplash.com/photo-1725100609222-86a51bee3c3a?auto=format&fit=crop&${heroImageOptions}`
};

const slides = computed(() => {
  currentLocale.value;
  return [
    {
      id: "platform",
      image: slideImages.platform,
      kicker: t("landing.hero.slides.platform.kicker"),
      title: t("landing.hero.slides.platform.title"),
      description: t("landing.hero.slides.platform.description"),
      primaryLabel: platformEntryLabel.value,
      primaryHref: platformEntryPath.value
    },
    {
      id: "planning",
      image: slideImages.planning,
      kicker: t("landing.hero.slides.planning.kicker"),
      title: t("landing.hero.slides.planning.title"),
      description: t("landing.hero.slides.planning.description"),
      primaryLabel: t("landing.hero.slides.planning.action"),
      primaryHref: platformEntryPath.value
    },
    {
      id: "tracking",
      image: slideImages.tracking,
      kicker: t("landing.hero.slides.tracking.kicker"),
      title: t("landing.hero.slides.tracking.title"),
      description: t("landing.hero.slides.tracking.description"),
      primaryLabel: t("landing.hero.slides.tracking.action"),
      primaryHref: trackingEntryPath
    }
  ];
});

const currentSlide = computed(() => slides.value[activeSlideIndex.value] || slides.value[0]);

const capabilities = computed(() => {
  currentLocale.value;
  return [
    {
      id: "planning",
      number: "01",
      icon: Box,
      status: "live",
      statusLabel: t("landing.status.available"),
      title: t("landing.capabilities.planning.title"),
      description: t("landing.capabilities.planning.description"),
      actionLabel: t("landing.capabilities.planning.action"),
      href: platformEntryPath.value,
      opensInNewTab: true
    },
    {
      id: "tracking",
      number: "02",
      icon: Search,
      status: "public",
      statusLabel: t("landing.status.public"),
      title: t("landing.capabilities.tracking.title"),
      description: t("landing.capabilities.tracking.description"),
      actionLabel: t("landing.capabilities.tracking.action"),
      href: trackingEntryPath,
      opensInNewTab: true
    },
    {
      id: "booking",
      number: "03",
      icon: Ship,
      status: "planned",
      statusLabel: t("landing.status.planned"),
      title: t("landing.capabilities.booking.title"),
      description: t("landing.capabilities.booking.description"),
      actionLabel: t("landing.capabilities.booking.action"),
      href: "#landing-roadmap",
      opensInNewTab: false
    },
    {
      id: "erp",
      number: "04",
      icon: OfficeBuilding,
      status: "planned",
      statusLabel: t("landing.status.planned"),
      title: t("landing.capabilities.erp.title"),
      description: t("landing.capabilities.erp.description"),
      actionLabel: t("landing.capabilities.erp.action"),
      href: "#landing-roadmap",
      opensInNewTab: false
    }
  ];
});

const companyServices = computed(() => {
  currentLocale.value;
  return [
    {
      id: "ocean-air",
      number: "01",
      icon: Ship,
      title: t("landing.company.services.oceanAir.title"),
      description: t("landing.company.services.oceanAir.description")
    },
    {
      id: "ground-rail",
      number: "02",
      icon: Connection,
      title: t("landing.company.services.groundRail.title"),
      description: t("landing.company.services.groundRail.description")
    },
    {
      id: "project",
      number: "03",
      icon: Box,
      title: t("landing.company.services.project.title"),
      description: t("landing.company.services.project.description")
    },
    {
      id: "warehouse",
      number: "04",
      icon: OfficeBuilding,
      title: t("landing.company.services.warehouse.title"),
      description: t("landing.company.services.warehouse.description")
    },
    {
      id: "compliance",
      number: "05",
      icon: Search,
      title: t("landing.company.services.compliance.title"),
      description: t("landing.company.services.compliance.description")
    },
    {
      id: "technology",
      number: "06",
      icon: Monitor,
      title: t("landing.company.services.technology.title"),
      description: t("landing.company.services.technology.description")
    }
  ];
});

function stopAutoplay() {
  if (autoplayTimer) window.clearInterval(autoplayTimer);
  autoplayTimer = 0;
}

function startAutoplay() {
  stopAutoplay();
  if (reducedMotion.value || showIntro.value || slides.value.length < 2) return;
  autoplayTimer = window.setInterval(nextSlide, 7200);
}

function goToSlide(index: number) {
  activeSlideIndex.value = index;
  startAutoplay();
}

function nextSlide() {
  activeSlideIndex.value = (activeSlideIndex.value + 1) % slides.value.length;
}

function previousSlide() {
  activeSlideIndex.value = (activeSlideIndex.value - 1 + slides.value.length) % slides.value.length;
  startAutoplay();
}

function navigateWithTransition(event: MouseEvent, href: string) {
  const currentTarget = event.currentTarget as HTMLAnchorElement | null;
  currentTarget?.closest("details")?.removeAttribute("open");
  if (!href || href.startsWith("#")) return;
  if (currentTarget?.target === "_blank") return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (isPageLeaving.value) return;
  isPageLeaving.value = true;
  stopAutoplay();
  document.body.style.overflow = "hidden";
  navigationTimer = window.setTimeout(() => {
    window.location.assign(href);
  }, reducedMotion.value ? 40 : 360);
}

function resetPageLeaving(resumeAutoplay = true) {
  window.clearTimeout(navigationTimer);
  navigationTimer = 0;
  isPageLeaving.value = false;
  document.body.style.overflow = showIntro.value ? "hidden" : previousBodyOverflow;
  if (resumeAutoplay && !showIntro.value && document.visibilityState === "visible") {
    startAutoplay();
  }
}

function handlePageShow() {
  resetPageLeaving(true);
}

function handlePageHide() {
  resetPageLeaving(false);
  stopAutoplay();
}

function finishIntro() {
  if (!showIntro.value) return;
  showIntro.value = false;
  window.clearTimeout(introTimer);
  document.body.style.overflow = previousBodyOverflow;
  try {
    sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
  } catch {
    // The intro remains functional when browser storage is unavailable.
  }
  startAutoplay();
}

function updateDocumentTitle() {
  currentLocale.value;
  document.title = t("landing.metaTitle");
}

function setupRevealObserver() {
  const root = landingRoot.value;
  const elements = root?.querySelectorAll<HTMLElement>(".landing-reveal");
  if (!root || !elements?.length) return;

  if (reducedMotion.value || !("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  root.classList.add("is-reveal-ready");
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver?.unobserve(entry.target);
    });
  }, {
    threshold: 0.12,
    rootMargin: "0px 0px -8% 0px"
  });

  elements.forEach((element) => revealObserver?.observe(element));
}

onMounted(() => {
  previousBodyOverflow = document.body.style.overflow;
  window.addEventListener("pageshow", handlePageShow);
  window.addEventListener("pagehide", handlePageHide);
  reducedMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const alreadySeen = introWasSeen();
  showIntro.value = !alreadySeen;
  if (showIntro.value) {
    document.body.style.overflow = "hidden";
    introTimer = window.setTimeout(finishIntro, reducedMotion.value ? 360 : 1100);
  } else {
    startAutoplay();
  }
  updateDocumentTitle();
  setupRevealObserver();
});

watch(currentLocale, updateDocumentTitle);

onUnmounted(() => {
  window.removeEventListener("pageshow", handlePageShow);
  window.removeEventListener("pagehide", handlePageHide);
  window.clearTimeout(introTimer);
  window.clearTimeout(navigationTimer);
  stopAutoplay();
  revealObserver?.disconnect();
  document.body.style.overflow = previousBodyOverflow;
  document.title = t("app.name");
});
</script>

<style scoped>
.landing-page {
  --landing-ink: #071829;
  --landing-navy: #0a2740;
  --landing-blue: #0b68d2;
  --landing-blue-bright: #1e8cff;
  --landing-cyan: #68d9ff;
  --landing-line: rgba(11, 50, 82, 0.14);
  min-height: 100vh;
  overflow-x: clip;
  color: var(--landing-ink);
  background: #f7f9fc;
  scroll-behavior: smooth;
}

.landing-page a {
  color: inherit;
  text-decoration: none;
}

#landing-top,
#landing-capabilities,
#landing-about,
#landing-company,
#landing-roadmap { scroll-margin-top: 84px; }

.landing-intro {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(circle at 50% 42%, rgba(31, 135, 241, 0.2), transparent 30%),
    linear-gradient(145deg, #04111f 0%, #071f35 48%, #061725 100%);
}

.landing-intro::before,
.landing-intro::after {
  content: "";
  position: absolute;
  pointer-events: none;
}

.landing-intro::before {
  inset: 0;
  opacity: 0.18;
  background-image:
    linear-gradient(rgba(116, 196, 255, 0.24) 1px, transparent 1px),
    linear-gradient(90deg, rgba(116, 196, 255, 0.24) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
}

.landing-intro::after {
  width: min(68vw, 900px);
  height: 1px;
  top: 50%;
  left: 50%;
  background: linear-gradient(90deg, transparent, rgba(104, 217, 255, 0.45), transparent);
  transform: translate(-50%, 92px);
}

.landing-intro__glow {
  position: absolute;
  width: 34vw;
  aspect-ratio: 1;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.16;
  background: #168cff;
}

.landing-intro__glow--one { top: -18vw; right: -12vw; }
.landing-intro__glow--two { bottom: -20vw; left: -12vw; background: #17d9d2; }

.landing-intro__content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: min(76vw, 360px);
}

.landing-intro__book {
  position: relative;
  width: 90px;
  height: 70px;
  margin-bottom: 30px;
  perspective: 720px;
  transform: rotate(-3deg);
}

.landing-intro__back,
.landing-intro__page,
.landing-intro__cover {
  position: absolute;
  inset: 0;
  border-radius: 3px 9px 9px 3px;
  transform-origin: left center;
}

.landing-intro__back {
  background: #0a76db;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.38);
}

.landing-intro__page {
  left: 4px;
  top: 4px;
  right: 3px;
  bottom: 4px;
  background: linear-gradient(90deg, #dceeff, #fff 45%, #cfe6f8);
  box-shadow: inset 6px 0 12px rgba(13, 48, 76, 0.15);
  animation: landing-flip-page 0.86s cubic-bezier(0.7, 0, 0.25, 1) infinite;
}

.landing-intro__page--two { animation-delay: 0.12s; }
.landing-intro__page--three { animation-delay: 0.24s; }

.landing-intro__cover {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: linear-gradient(145deg, #1689f5, #0753af);
  box-shadow: inset 1px 0 rgba(255, 255, 255, 0.3);
  animation: landing-open-cover 1.05s cubic-bezier(0.7, 0, 0.2, 1) both;
}

.landing-intro__cover img {
  width: 48px;
  height: 48px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(0, 25, 54, 0.3);
}

.landing-intro__wordmark {
  display: flex;
  flex-direction: column;
  align-items: center;
  letter-spacing: 0.035em;
}

.landing-intro__wordmark span {
  font-size: clamp(25px, 4vw, 44px);
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.landing-intro__wordmark small {
  margin-top: 11px;
  color: rgba(255, 255, 255, 0.56);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3em;
}

.landing-intro__content > p {
  margin: 28px 0 14px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  letter-spacing: 0.08em;
}

.landing-intro__progress {
  width: min(72vw, 320px);
  height: 2px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
}

.landing-intro__progress i {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #26c7ff, #fff);
  transform-origin: left;
  animation: landing-intro-progress 1.02s ease both;
}

button.landing-intro__skip {
  position: absolute;
  right: 28px;
  bottom: 24px;
  min-height: auto;
  padding: 8px 12px;
  border: 0;
  border-radius: 0;
  color: rgba(255, 255, 255, 0.56);
  background: none;
  box-shadow: none;
  font-size: 12px;
  letter-spacing: 0.12em;
}

button.landing-intro__skip:hover {
  color: #fff;
  border: 0;
  background: none;
  box-shadow: none;
}

.landing-intro-enter-active,
.landing-intro-leave-active { transition: opacity 0.55s ease, filter 0.55s ease; }
.landing-intro-enter-from,
.landing-intro-leave-to { opacity: 0; filter: blur(8px); }

.landing-header {
  position: sticky;
  top: 0;
  z-index: 80;
  min-height: 84px;
  display: grid;
  grid-template-columns: minmax(290px, 0.9fr) auto minmax(260px, 0.8fr);
  align-items: center;
  gap: 28px;
  padding: 0 clamp(24px, 4vw, 72px);
  border-bottom: 1px solid rgba(7, 24, 41, 0.09);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 12px 30px rgba(7, 24, 41, 0.08);
  backdrop-filter: blur(18px);
}

.landing-brand {
  display: inline-flex;
  align-items: center;
  gap: 13px;
  width: fit-content;
}

.landing-brand__mark {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  overflow: hidden;
  border-radius: 9px;
  place-items: center;
  box-shadow: 0 8px 18px rgba(7, 43, 73, 0.16);
}

.landing-brand__mark img {
  display: block;
  width: 100%;
  height: 100%;
}

.landing-brand__copy {
  display: flex;
  flex-direction: column;
}

.landing-brand__copy strong {
  color: #071829;
  font-size: 21px;
  line-height: 1;
  letter-spacing: 0.015em;
  white-space: nowrap;
}

.landing-brand__copy small {
  margin-top: 5px;
  color: #658096;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.landing-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(18px, 2.2vw, 38px);
  white-space: nowrap;
}

.landing-nav > a,
.landing-nav__dropdown > summary {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 31px 0 28px;
  color: #233e56;
  font-size: 14px;
  font-weight: 650;
}

.landing-nav > a::after,
.landing-nav__dropdown > summary::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 3px;
  background: #0b73d7;
  transform: scaleX(0);
  transition: transform 0.2s ease;
}

.landing-nav > a:hover::after,
.landing-nav > a:focus-visible::after,
.landing-nav__dropdown > summary:hover::after,
.landing-nav__dropdown > summary:focus-visible::after,
.landing-nav__dropdown[open] > summary::after { transform: scaleX(1); }

.landing-nav__dropdown { position: relative; }
.landing-nav__dropdown > summary { list-style: none; cursor: pointer; }
.landing-nav__dropdown > summary::-webkit-details-marker { display: none; }
.landing-nav__dropdown > summary > span {
  width: 7px;
  height: 7px;
  margin: -3px 2px 0 3px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
  transition: transform 0.2s ease;
}
.landing-nav__dropdown[open] > summary > span { margin-top: 3px; transform: rotate(225deg); }

.landing-nav__menu {
  position: absolute;
  top: 72px;
  left: 50%;
  width: 286px;
  display: grid;
  gap: 5px;
  padding: 10px;
  border: 1px solid #dce7f0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 58px rgba(12, 48, 77, 0.16);
  transform: translateX(-50%);
}

.landing-nav__menu::before {
  content: "";
  position: absolute;
  top: -6px;
  left: 50%;
  width: 11px;
  height: 11px;
  border-top: 1px solid #dce7f0;
  border-left: 1px solid #dce7f0;
  background: #fff;
  transform: translateX(-50%) rotate(45deg);
}

.landing-nav__menu a {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 36px 1fr;
  align-items: center;
  gap: 11px;
  padding: 10px 11px;
  border-radius: 10px;
  color: #25435b;
  white-space: normal;
}

.landing-nav__menu a:hover { background: #f1f7fc; }
.landing-nav__menu .el-icon { width: 36px; height: 36px; border-radius: 9px; color: #0b70cf; background: #eaf4fd; }
.landing-nav__menu a > span { display: flex; flex-direction: column; gap: 3px; }
.landing-nav__menu strong { font-size: 12px; }
.landing-nav__menu small { color: #8092a1; font-size: 9px; font-weight: 700; }

.landing-nav__tracking span {
  padding: 3px 6px;
  border-radius: 999px;
  color: #08765e;
  background: #e3f8f0;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.landing-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.landing-language {
  box-shadow: none;
}

.landing-entry-button {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 19px;
  border: 1px solid #0b68d2;
  border-radius: 999px;
  color: #095eb8;
  font-size: 13px;
  font-weight: 750;
  transition: color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.landing-entry-button:hover {
  color: #fff;
  background: #0b68d2;
  transform: translateY(-1px);
}

.landing-hero {
  position: relative;
  min-height: 720px;
  overflow: hidden;
  color: #fff;
  background: #071829;
  perspective: 1800px;
}

.landing-hero__slide {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: cover;
  will-change: transform, opacity;
}

.landing-hero__wash {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(2, 17, 31, 0.92) 0%, rgba(4, 28, 49, 0.76) 46%, rgba(6, 35, 58, 0.24) 78%, rgba(3, 15, 27, 0.18) 100%),
    linear-gradient(0deg, rgba(3, 18, 31, 0.46), transparent 56%);
}

.landing-hero__angle {
  position: absolute;
  pointer-events: none;
}

.landing-hero__angle--left {
  inset: 0 37% 0 -10%;
  opacity: 0.5;
  background: #061a2d;
  clip-path: polygon(0 0, 100% 0, 72% 100%, 0 100%);
}

.landing-hero__angle--right {
  top: 0;
  right: -10%;
  bottom: 0;
  width: 44%;
  opacity: 0.13;
  background: #8bcfff;
  clip-path: polygon(42% 0, 100% 0, 100% 100%, 0 100%);
}

.landing-hero__grid {
  position: absolute;
  inset: 0;
  opacity: 0.14;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
  background-size: 76px 76px;
  mask-image: linear-gradient(90deg, #000, transparent 68%);
}

.landing-hero__inner {
  position: relative;
  z-index: 2;
  width: min(1400px, calc(100% - 96px));
  min-height: 720px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  margin: 0 auto;
  padding: 46px 0 132px;
}

.landing-hero__content {
  align-self: center;
  min-width: 0;
  max-width: 930px;
}

.landing-kicker {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 18px;
  color: #b9ddf7;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.landing-kicker span {
  width: 34px;
  height: 2px;
  background: #36b7ff;
}

.landing-hero h1 {
  max-width: 850px;
  margin: 0;
  color: #fff;
  font-size: clamp(44px, 4.35vw, 68px);
  font-weight: 680;
  letter-spacing: -0.028em;
  line-height: 1.13;
  text-wrap: balance;
}

.landing-page.is-english .landing-hero h1 {
  max-width: 920px;
  font-size: clamp(40px, 4vw, 64px);
  font-weight: 720;
  letter-spacing: -0.036em;
  line-height: 1.12;
}

.landing-hero__description {
  max-width: 680px;
  margin: 20px 0 0;
  color: rgba(232, 244, 255, 0.8);
  font-size: clamp(14px, 1.05vw, 17px);
  line-height: 1.7;
}

.landing-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 28px;
}

.landing-button {
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 25px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 760;
  transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.landing-button:hover { transform: translateY(-2px); }

.landing-button--primary {
  border: 1px solid #1689f5;
  color: #fff;
  background: #0b73d7;
  box-shadow: 0 14px 34px rgba(0, 102, 204, 0.34);
}

.landing-button--primary:hover { background: #1587f0; }

.landing-button--ghost {
  border: 1px solid rgba(255, 255, 255, 0.48);
  color: #fff;
  background: rgba(8, 29, 48, 0.2);
  backdrop-filter: blur(10px);
}

.landing-button--ghost:hover { border-color: #fff; background: rgba(255, 255, 255, 0.1); }

.landing-hero__footer {
  position: absolute;
  z-index: 5;
  right: clamp(30px, 5vw, 88px);
  bottom: 92px;
  left: clamp(30px, 5vw, 88px);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.landing-hero__pagination {
  display: flex;
  align-items: center;
  gap: 18px;
}

.landing-hero__pagination button,
.landing-hero__arrows button {
  min-height: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: rgba(255, 255, 255, 0.46);
  background: none;
  box-shadow: none;
}

.landing-hero__pagination button {
  display: grid;
  grid-template-columns: auto 44px;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  font-weight: 800;
}

.landing-hero__pagination button i {
  width: 44px;
  height: 2px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.2);
}

.landing-hero__pagination button i::after {
  content: "";
  display: block;
  width: 100%;
  height: 100%;
  background: #4cc4ff;
  transform: scaleX(0);
  transform-origin: left;
}

.landing-hero__pagination button.active { color: #fff; }
.landing-hero__pagination button.active i::after { animation: landing-slide-progress 7.2s linear both; }

.landing-hero__arrows { display: flex; gap: 2px; }

.landing-hero__arrows button {
  width: 48px;
  height: 46px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(12, 48, 76, 0.7);
  background: rgba(255, 255, 255, 0.56);
  box-shadow: 0 10px 28px rgba(0, 18, 34, 0.08);
  backdrop-filter: blur(10px);
  opacity: 0.78;
  transition: color 0.2s ease, background 0.2s ease, opacity 0.2s ease;
}

.landing-hero__arrows button:hover {
  border-color: rgba(255, 255, 255, 0.34);
  color: #123d5f;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 12px 30px rgba(0, 18, 34, 0.12);
  opacity: 0.96;
}

.landing-hero-page-enter-active,
.landing-hero-page-leave-active {
  transition: transform 0.72s cubic-bezier(0.7, 0, 0.2, 1), opacity 0.6s ease, filter 0.6s ease;
  transform-style: preserve-3d;
  backface-visibility: hidden;
}

.landing-hero-page-enter-from {
  opacity: 0;
  filter: brightness(0.55);
  transform: rotateY(-10deg) scale(1.035);
  transform-origin: left center;
}

.landing-hero-page-leave-to {
  opacity: 0;
  filter: brightness(0.55);
  transform: rotateY(10deg) scale(1.015);
  transform-origin: right center;
}

.landing-capabilities {
  position: relative;
  z-index: 8;
  width: 100%;
  margin: 0;
  padding: 34px max(32px, calc((100vw - 1440px) / 2)) 48px;
  background: #f7f9fc;
}

.landing-capabilities__layout {
  max-width: 1440px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 194px;
  gap: 14px;
  margin: 0 auto;
}

.landing-capabilities__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.landing-capability-card {
  position: relative;
  min-height: 212px;
  display: flex;
  flex-direction: column;
  padding: 22px 20px 20px;
  overflow: hidden;
  border: 1px solid #dce6ef;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(8, 36, 59, 0.1);
  transition: color 0.25s ease, background 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
}

.landing-capability-card::after {
  content: "";
  position: absolute;
  right: -44px;
  bottom: -54px;
  width: 140px;
  height: 140px;
  border: 1px solid rgba(21, 112, 205, 0.14);
  border-radius: 50%;
  box-shadow: 0 0 0 22px rgba(21, 112, 205, 0.04);
}

.landing-capability-card:hover {
  color: #fff;
  background: #0b68c7;
  transform: translateY(-8px);
  box-shadow: 0 25px 58px rgba(7, 73, 139, 0.28);
}

.landing-capability-card.is-public { border-color: #8bcdb7; }
.landing-capability-card.is-public::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: linear-gradient(90deg, #20bc88, #27a6eb);
}

.landing-capability-card__number {
  position: absolute;
  top: 18px;
  right: 18px;
  color: #a9b9c7;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.landing-capability-card__free {
  position: absolute;
  top: 17px;
  right: 48px;
  padding: 3px 7px;
  border: 1px solid rgba(20, 160, 117, 0.2);
  border-radius: 999px;
  color: #08795d;
  background: #e7f8f1;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.1em;
}

.landing-capability-card__icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #0b6fd2;
  background: #eaf4ff;
  font-size: 20px;
}

.landing-capability-card__status {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 15px;
  color: #71879a;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.landing-capability-card__status i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #42c893;
  box-shadow: 0 0 0 4px rgba(66, 200, 147, 0.12);
}

.landing-capability-card--booking .landing-capability-card__status i,
.landing-capability-card--erp .landing-capability-card__status i {
  background: #aab8c4;
  box-shadow: none;
}

.landing-capability-card h2 {
  margin: 10px 0 6px;
  color: #10283e;
  font-size: 17px;
  letter-spacing: -0.02em;
}

.landing-capability-card p {
  margin: 0;
  color: #63788b;
  font-size: 11px;
  line-height: 1.6;
}

.landing-capability-card__link {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: auto;
  padding-top: 10px;
  color: #0b68c7;
  font-size: 12px;
  font-weight: 800;
}

.landing-capability-card:hover h2,
.landing-capability-card:hover p,
.landing-capability-card:hover .landing-capability-card__status,
.landing-capability-card:hover .landing-capability-card__link,
.landing-capability-card:hover .landing-capability-card__number { color: #fff; }

.landing-capability-card:hover .landing-capability-card__free {
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
}

.landing-capability-card:hover .landing-capability-card__icon {
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
}

.landing-capabilities__aside {
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.landing-capabilities__aside article,
.landing-capabilities__aside > a {
  min-height: 96px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 16px;
  border: 1px solid #dfe8ef;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 10px 26px rgba(8, 36, 59, 0.05);
}

.landing-capabilities__aside > a {
  border-color: rgba(96, 189, 157, 0.42);
  background: linear-gradient(145deg, rgba(249, 255, 252, 0.9), rgba(239, 250, 246, 0.82));
}

.landing-capabilities__aside small {
  color: #8798a6;
  font-size: 8px;
  font-weight: 850;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.landing-capabilities__aside strong {
  margin-top: 8px;
  color: #1d70b5;
  font-size: 20px;
  letter-spacing: -0.035em;
}

.landing-capabilities__aside > a strong { color: #168066; }
.landing-capabilities__aside span { margin-top: 5px; color: #708395; font-size: 9px; line-height: 1.48; }

.landing-statement {
  padding: 120px max(32px, calc((100vw - 1260px) / 2)) 100px;
  text-align: center;
  background: #f7f9fc;
}

.landing-section-heading > p {
  margin: 0 0 16px;
  color: #0b6fd2;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.landing-section-heading h2 {
  max-width: 760px;
  margin: 0;
  color: #0b2134;
  font-size: clamp(34px, 4vw, 56px);
  letter-spacing: -0.04em;
  line-height: 1.12;
  text-wrap: balance;
}

.landing-section-heading > span {
  display: block;
  max-width: 760px;
  margin-top: 22px;
  color: #60768a;
  font-size: 16px;
  line-height: 1.8;
}

.landing-section-heading--center {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.landing-statement__actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 42px;
}

.landing-pill {
  width: min(340px, 42vw);
  min-height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 11px;
  border-radius: 999px;
  color: #fff !important;
  font-size: 15px;
  font-weight: 760;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.landing-pill:hover { transform: translateY(-2px); box-shadow: 0 15px 32px rgba(10, 55, 91, 0.18); }
.landing-pill--dark { background: #0b2134; }
.landing-pill--blue { background: #1474d2; }

.landing-statement__metrics {
  max-width: 900px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 72px auto 0;
  border-top: 1px solid var(--landing-line);
  border-bottom: 1px solid var(--landing-line);
}

.landing-statement__metrics div {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
  padding: 25px 16px;
}

.landing-statement__metrics div + div { border-left: 1px solid var(--landing-line); }
.landing-statement__metrics strong { color: #0b6fd2; font-size: 28px; }
.landing-statement__metrics span { color: #526b80; font-size: 13px; font-weight: 700; }

.landing-company {
  position: relative;
  padding: 112px max(32px, calc((100vw - 1260px) / 2));
  overflow: hidden;
  color: #10283e;
  background:
    radial-gradient(circle at 93% 16%, rgba(32, 141, 232, 0.08), transparent 26%),
    #fff;
}

.landing-company::before {
  content: "";
  position: absolute;
  top: -180px;
  right: -170px;
  width: 520px;
  height: 520px;
  border: 86px solid rgba(23, 119, 208, 0.035);
  border-radius: 50%;
  pointer-events: none;
}

.landing-company__intro {
  position: relative;
  z-index: 1;
  max-width: 1260px;
  display: grid;
  grid-template-columns: minmax(0, 0.94fr) minmax(430px, 1.06fr);
  align-items: center;
  gap: clamp(64px, 7vw, 104px);
  margin-right: auto;
  margin-left: auto;
}

.landing-company__eyebrow {
  margin: 0 0 18px;
  color: #0b70cf;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0.19em;
}

.landing-company__international-name {
  display: block;
  margin-bottom: 12px;
  color: #6f8598;
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.12em;
}

.landing-company__identity h2 {
  max-width: 680px;
  margin: 0;
  color: #0b2134;
  font-size: clamp(34px, 3.35vw, 50px);
  font-weight: 690;
  letter-spacing: -0.035em;
  line-height: 1.16;
  text-wrap: balance;
}

.landing-page.is-english .landing-company__identity h2 {
  font-size: clamp(31px, 3.1vw, 46px);
  line-height: 1.14;
}

.landing-company__description {
  max-width: 720px;
  margin: 26px 0 0;
  color: #334f68;
  font-size: 16px;
  line-height: 1.78;
}

.landing-company__detail {
  max-width: 720px;
  margin: 13px 0 0;
  color: #6a7f91;
  font-size: 13px;
  line-height: 1.8;
}

.landing-company__registration {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 28px 0 0;
  padding: 20px 0;
  border-top: 1px solid #e1e9f0;
  border-bottom: 1px solid #e1e9f0;
}

.landing-company__registration div { padding-right: 18px; }
.landing-company__registration div + div { padding-left: 18px; border-left: 1px solid #e1e9f0; }
.landing-company__registration dt { color: #8193a3; font-size: 10px; font-weight: 750; }
.landing-company__registration dd { margin: 7px 0 0; color: #173650; font-size: 13px; font-weight: 780; }

.landing-company__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  margin-top: 32px;
}

.landing-button--company {
  min-height: 50px;
  border: 1px solid #0c72ce;
  color: #fff !important;
  background: linear-gradient(135deg, #0c70cf, #108ce8);
  box-shadow: 0 16px 34px rgba(0, 90, 173, 0.26);
}

.landing-company__credit-code {
  color: #5f778b;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.035em;
}

.landing-company__source-note {
  display: block;
  max-width: 680px;
  margin-top: 22px;
  color: #94a3af;
  font-size: 10px;
  line-height: 1.65;
}

.landing-company__operations {
  position: relative;
  min-height: 390px;
  padding: 30px;
  border: 1px solid #d7e6f2;
  border-radius: 24px;
  background:
    linear-gradient(rgba(39, 126, 196, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(39, 126, 196, 0.055) 1px, transparent 1px),
    linear-gradient(145deg, #f8fbfe, #edf6fd);
  background-size: 42px 42px, 42px 42px, auto;
  box-shadow: 0 28px 70px rgba(19, 64, 99, 0.13);
}

.landing-company__operations::after {
  content: "";
  position: absolute;
  right: 46px;
  bottom: 54px;
  width: 140px;
  height: 140px;
  border: 32px solid rgba(24, 120, 200, 0.055);
  border-radius: 50%;
}

.landing-company__operations-head,
.landing-company__operations-foot {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.landing-company__operations-head span { display: flex; flex-direction: column; gap: 5px; }
.landing-company__operations-head small { color: #7c91a3; font-size: 9px; font-weight: 850; letter-spacing: 0.14em; }
.landing-company__operations-head strong { color: #173c59; font-size: 17px; }
.landing-company__operations-head > i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #2ac38d;
  box-shadow: 0 0 0 6px rgba(42, 195, 141, 0.12);
}

.landing-company__operations-route {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: auto 1fr auto 1fr auto;
  align-items: center;
  gap: 13px;
  margin: 74px 0 58px;
}

.landing-company__operations-route > span {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
}

.landing-company__operations-route > span b {
  min-width: 52px;
  min-height: 44px;
  display: grid;
  place-items: center;
  padding: 0 10px;
  border: 1px solid #cbddea;
  border-radius: 12px;
  color: #315875;
  background: #fff;
  font-size: 10px;
  box-shadow: 0 9px 22px rgba(25, 75, 112, 0.09);
}

.landing-company__operations-route > span.is-origin b { color: #fff; border-color: #0b73d7; background: #0b73d7; }
.landing-company__operations-route > span small { color: #8193a2; font-size: 9px; white-space: nowrap; }

.landing-company__operations-route > div {
  position: relative;
  height: 2px;
  overflow: visible;
  background: #bdd8ea;
}

.landing-company__operations-route > div i {
  position: absolute;
  top: -3px;
  width: 8px;
  height: 8px;
  border: 2px solid #42a3e4;
  border-radius: 50%;
  background: #f3f9fd;
}

.landing-company__operations-route > div i:first-child { left: 0; }
.landing-company__operations-route > div i:last-child { right: 0; }
.landing-company__operations-route > div b {
  position: absolute;
  top: -4px;
  left: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #0b73d7;
  box-shadow: 0 0 0 5px rgba(11, 115, 215, 0.12);
  animation: landing-operation-pulse 4.8s ease-in-out infinite;
}

.landing-company__operations-route > div:nth-of-type(2) b { animation-delay: 1.6s; }
.landing-company__operations-modes { position: relative; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px; }
.landing-company__operations-modes span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border: 1px solid #d5e4ef;
  border-radius: 999px;
  color: #517088;
  background: rgba(255, 255, 255, 0.72);
  font-size: 9px;
  font-weight: 800;
}

.landing-company__operations-foot { margin-top: 25px; padding-top: 18px; border-top: 1px solid #d8e7f1; }
.landing-company__operations-foot span { color: #7890a2; font-size: 10px; }
.landing-company__operations-foot strong { color: #08795c; font-size: 10px; letter-spacing: 0.1em; }
.landing-company__operations-float {
  position: absolute;
  z-index: 3;
  min-width: 148px;
  padding: 13px 15px;
  border: 1px solid #d5e5f0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 16px 34px rgba(25, 70, 105, 0.12);
}
.landing-company__operations-float small { display: block; color: #8394a2; font-size: 8px; font-weight: 850; letter-spacing: 0.11em; }
.landing-company__operations-float strong { display: block; margin-top: 6px; color: #0b70cf; font-size: 11px; }
.landing-company__operations-float--tracking { top: 78px; right: -24px; }
.landing-company__operations-float--planning { right: 54px; bottom: -26px; }

.landing-services {
  position: relative;
  padding: 118px max(32px, calc((100vw - 1500px) / 2));
  overflow: hidden;
  background:
    radial-gradient(circle at 19% 42%, rgba(69, 164, 231, 0.07), transparent 23%),
    #f7f9fc;
}

.landing-services__inner {
  position: relative;
  z-index: 1;
  max-width: 1500px;
  display: grid;
  grid-template-columns: minmax(410px, 0.72fr) minmax(0, 1.28fr);
  align-items: start;
  gap: clamp(64px, 6vw, 112px);
  margin: 0 auto;
}

.landing-services__heading-orbit {
  position: sticky;
  top: 118px;
  width: min(100%, 540px);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  padding: clamp(58px, 6vw, 82px);
  border: 1px solid rgba(43, 129, 194, 0.36);
  border-radius: 50%;
  background:
    radial-gradient(circle at 34% 30%, rgba(255, 255, 255, 0.96), rgba(242, 248, 253, 0.76) 58%, rgba(232, 243, 251, 0.5));
  box-shadow:
    0 26px 70px rgba(24, 70, 105, 0.07),
    inset 0 0 0 18px rgba(255, 255, 255, 0.46);
}

.landing-services__heading-orbit::before {
  content: "";
  position: absolute;
  inset: 22px;
  border: 1px solid rgba(21, 112, 205, 0.08);
  border-radius: inherit;
  border-top-color: rgba(21, 112, 205, 0.28);
  transform: rotate(-18deg);
}

.landing-services__heading-orbit::after {
  content: "";
  position: absolute;
  top: 17%;
  right: 8.5%;
  width: 9px;
  height: 9px;
  border: 3px solid #f7f9fc;
  border-radius: 50%;
  background: #20a3e8;
  box-shadow: 0 0 0 8px rgba(32, 163, 232, 0.1);
}

.landing-services__heading-orbit .landing-section-heading {
  position: relative;
  z-index: 1;
}

.landing-services .landing-section-heading h2 {
  max-width: 440px;
  font-size: clamp(31px, 3vw, 43px);
}

.landing-services .landing-section-heading > span {
  max-width: 430px;
  font-size: 14px;
}

.landing-company__service-timeline {
  position: relative;
  padding: 12px 0 24px;
}

.landing-company__service-timeline::before {
  content: "";
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 50%;
  width: 2px;
  border-radius: 999px;
  background-image:
    linear-gradient(#cfdeea, #cfdeea),
    linear-gradient(180deg, transparent, #1697e3 34%, #37c7a0 68%, transparent);
  background-repeat: no-repeat;
  background-position: 0 0, 0 -28%;
  background-size: 100% 100%, 100% 24%;
  box-shadow: 0 0 0 5px rgba(35, 139, 211, 0.035);
  animation: landing-service-line 5.8s ease-in-out infinite;
}

.landing-company__service-card {
  position: relative;
  width: calc(50% - 44px);
  min-height: 148px;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: 18px;
  margin-bottom: 18px;
  padding: 22px 23px;
  border: 1px solid #dce6ee;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 28px rgba(18, 51, 76, 0.055);
  transition: border-color 0.22s ease, background 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease;
}

.landing-company__service-card:nth-child(odd) { margin-right: auto; }
.landing-company__service-card:nth-child(even) { margin-left: auto; }

.landing-company__service-card::before {
  content: "";
  position: absolute;
  top: 50%;
  width: 44px;
  height: 1px;
  background: #c9dae7;
}

.landing-company__service-card:nth-child(odd)::before { right: -44px; }
.landing-company__service-card:nth-child(even)::before { left: -44px; }

.landing-company__service-card::after {
  content: "";
  position: absolute;
  top: calc(50% - 7px);
  width: 14px;
  height: 14px;
  border: 3px solid #f7f9fc;
  border-radius: 50%;
  background: #168bd7;
  box-shadow: 0 0 0 5px rgba(22, 139, 215, 0.13);
  animation: landing-service-node 3.8s ease-in-out calc(var(--service-index, 0) * 0.32s) infinite;
}

.landing-company__service-card:nth-child(odd)::after { right: -51px; }
.landing-company__service-card:nth-child(even)::after { left: -51px; }

.landing-company__service-card:hover {
  border-color: #9dcbea;
  background: #fff;
  transform: translateY(-3px);
  box-shadow: 0 18px 42px rgba(18, 72, 112, 0.1);
}

.landing-company__service-icon {
  width: 43px;
  height: 43px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  color: #0b73d7;
  background: #edf6ff;
  font-size: 20px;
}

.landing-company__service-card small {
  display: block;
  color: #0b73d7;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.14em;
}

.landing-company__service-card h3 {
  margin: 10px 0 7px;
  color: #17354d;
  font-size: 16px;
  letter-spacing: -0.015em;
}

.landing-company__service-card p {
  margin: 0;
  color: #667d90;
  font-size: 12px;
  line-height: 1.7;
}

.landing-roadmap {
  min-height: 690px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  background: #fff;
}

.landing-roadmap__visual {
  position: relative;
  min-height: 690px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    linear-gradient(rgba(65, 153, 224, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(65, 153, 224, 0.08) 1px, transparent 1px),
    radial-gradient(circle at 40% 36%, #dff4ff, #edf5fb 48%, #e6edf4 100%);
  background-size: 54px 54px, 54px 54px, auto;
}

.landing-roadmap__orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(3px);
}

.landing-roadmap__orb--one {
  width: 360px;
  height: 360px;
  top: -130px;
  right: -80px;
  border: 70px solid rgba(19, 122, 210, 0.08);
}

.landing-roadmap__orb--two {
  width: 240px;
  height: 240px;
  bottom: -110px;
  left: -50px;
  background: rgba(16, 151, 139, 0.1);
}

.landing-roadmap__console {
  position: relative;
  width: min(78%, 560px);
  padding: 25px;
  border: 1px solid rgba(13, 91, 151, 0.16);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 34px 80px rgba(20, 70, 107, 0.18);
  backdrop-filter: blur(18px);
  transform: rotate(-2deg);
}

.landing-roadmap__console::before {
  content: "";
  position: absolute;
  inset: 11px -15px -17px 14px;
  z-index: -1;
  border-radius: 18px;
  background: #0b68c7;
  opacity: 0.14;
}

.landing-roadmap__console-head,
.landing-roadmap__console-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #6c8496;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.11em;
}

.landing-roadmap__console-head i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #27c68d;
  box-shadow: 0 0 0 5px rgba(39, 198, 141, 0.12);
}

.landing-roadmap__route-line {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr auto 1fr auto;
  align-items: center;
  gap: 7px;
  margin: 32px 0 24px;
}

.landing-roadmap__route-line span {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: #0c6dca;
  font-size: 9px;
  font-weight: 850;
}

.landing-roadmap__route-line span:nth-of-type(n+3) { color: #8496a5; background: #e9eef3; }
.landing-roadmap__route-line i { height: 2px; background: linear-gradient(90deg, #0c6dca, #cfdbe5); }

.landing-roadmap__modules {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 9px;
}

.landing-roadmap__modules div {
  min-height: 82px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid #dee7ee;
  border-radius: 10px;
  color: #91a0ac;
  background: #f6f8fa;
  font-size: 9px;
  font-weight: 850;
}

.landing-roadmap__modules .el-icon { font-size: 23px; }
.landing-roadmap__modules .is-live { color: #0b68c7; border-color: #b7d9f8; background: #eaf5ff; }
.landing-roadmap__modules .is-public { color: #087c60; border-color: #a6dbc9; background: #eaf9f4; }
.landing-roadmap__console-foot { margin-top: 26px; }
.landing-roadmap__console-foot strong { color: #0b68c7; font-size: 14px; }

.landing-roadmap__content {
  align-self: center;
  max-width: 650px;
  padding: 80px clamp(44px, 7vw, 120px);
}

.landing-roadmap__stages {
  display: grid;
  gap: 12px;
  margin-top: 36px;
}

.landing-roadmap__stages > div {
  position: relative;
  padding: 20px 22px 20px 53px;
  border-left: 2px solid #d8e2eb;
  background: #f7f9fb;
}

.landing-roadmap__stages > div::before {
  content: "";
  position: absolute;
  left: 20px;
  top: 27px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #a9b9c6;
}

.landing-roadmap__stages > div.is-current { border-left-color: #0b73d7; background: #eef7ff; }
.landing-roadmap__stages > div.is-current::before { background: #0b73d7; box-shadow: 0 0 0 6px rgba(11, 115, 215, 0.12); }

.landing-roadmap__stages span {
  display: block;
  margin-bottom: 4px;
  color: #698094;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.landing-roadmap__stages strong { color: #10283e; font-size: 16px; }
.landing-roadmap__stages p { margin: 6px 0 0; color: #63798c; font-size: 13px; line-height: 1.6; }

.landing-text-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 30px;
  color: #0b68c7 !important;
  font-size: 13px;
  font-weight: 850;
}

.landing-footer {
  color: #486378;
  background: #f3f7fa;
}

.landing-footer__main {
  max-width: 1380px;
  display: grid;
  grid-template-columns: minmax(260px, 1.1fr) minmax(130px, 0.5fr) minmax(250px, 0.9fr) minmax(310px, 1.15fr);
  gap: clamp(34px, 5vw, 76px);
  margin: 0 auto;
  padding: 68px 32px 58px;
}

.landing-footer__brand { display: flex; align-items: flex-start; gap: 15px; }
.landing-footer__brand .landing-brand__mark { margin-top: 2px; color: #0b73d7; }
.landing-footer__brand strong { color: #0b2134; font-size: 18px; letter-spacing: 0.015em; }
.landing-footer__brand p { max-width: 260px; margin: 8px 0 0; color: #5b7285; font-size: 12px; line-height: 1.65; }
.landing-footer__brand div > span { display: block; margin-top: 14px; color: #7f92a1; font-size: 10px; line-height: 1.6; }

.landing-footer__column { display: flex; flex-direction: column; align-items: flex-start; gap: 9px; }
.landing-footer__column h3 { margin: 0 0 11px; color: #17374f; font-size: 12px; letter-spacing: 0.05em; }
.landing-footer__column > a { color: #527088; font-size: 11px; font-weight: 700; }
.landing-footer__column > a:hover { color: #0b70cf; }
.landing-footer__column p { margin: 0; color: #637c90; font-size: 10px; line-height: 1.65; }
.landing-footer__column p > span { display: block; color: #91a0ac; font-size: 8px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
.landing-footer__registration p { width: 100%; display: flex; align-items: baseline; justify-content: space-between; gap: 14px; padding-bottom: 7px; border-bottom: 1px solid rgba(96, 128, 152, 0.13); }
.landing-footer__registration p > span { display: inline; flex: 0 0 auto; }
.landing-footer__registration strong { color: #294c66; font-size: 9px; text-align: right; }

.landing-footer__bottom {
  max-width: 1380px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin: 0 auto;
  padding: 22px 32px;
  border-top: 1px solid #d5e2ec;
  color: #8394a2;
  font-size: 9px;
}

.landing-statement,
.landing-company,
.landing-services,
.landing-roadmap,
.landing-footer {
  content-visibility: auto;
  contain-intrinsic-size: 1px 720px;
}

@keyframes landing-flip-page {
  0% { opacity: 0; transform: rotateY(0); }
  10% { opacity: 1; }
  65%, 100% { opacity: 0; transform: rotateY(-176deg); }
}

@keyframes landing-open-cover {
  0%, 18% { transform: rotateY(0); }
  72%, 100% { transform: rotateY(-158deg); }
}

@keyframes landing-intro-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

@keyframes landing-slide-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

@keyframes landing-operation-pulse {
  0%, 12% { left: 0; transform: scale(0.82); opacity: 0; }
  20% { opacity: 1; }
  78% { opacity: 1; }
  88%, 100% { left: calc(100% - 10px); transform: scale(1); opacity: 0; }
}

@keyframes landing-service-line {
  0%, 8% { background-position: 0 0, 0 -28%; }
  86%, 100% { background-position: 0 0, 0 128%; }
}

@keyframes landing-service-node {
  0%, 100% { box-shadow: 0 0 0 5px rgba(22, 139, 215, 0.1); transform: scale(0.9); }
  45% { box-shadow: 0 0 0 10px rgba(22, 139, 215, 0.035); transform: scale(1); }
}

@keyframes landing-scroll-reveal {
  from {
    opacity: 0;
    translate: 0 28px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

.landing-page.is-reveal-ready .landing-reveal {
  opacity: 0;
  translate: 0 28px;
}

.landing-page.is-reveal-ready .landing-reveal.is-visible {
  animation: landing-scroll-reveal 0.72s cubic-bezier(0.22, 1, 0.36, 1) var(--landing-reveal-delay, 0ms) both;
}

.landing-reveal--delay-1 { --landing-reveal-delay: 90ms; }
.landing-reveal--delay-2 { --landing-reveal-delay: 180ms; }

@media (max-width: 1180px) {
  .landing-header { grid-template-columns: minmax(200px, 1fr) auto; }
  .landing-nav { display: none; }
  .landing-hero__inner { width: min(100% - 64px, 1100px); grid-template-columns: 1fr; }
  .landing-capabilities__layout { grid-template-columns: 1fr; }
  .landing-capabilities__grid { grid-template-columns: repeat(2, 1fr); }
  .landing-capabilities__aside {
    grid-template-rows: none;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .landing-capability-card { min-height: 218px; }
  .landing-company__intro { max-width: 820px; grid-template-columns: 1fr; }
  .landing-company__operations { width: min(100%, 720px); margin: 0 auto; }
  .landing-services__inner { grid-template-columns: 1fr; }
  .landing-services__heading-orbit { position: relative; top: auto; margin: 0 auto; }
  .landing-services .landing-section-heading h2,
  .landing-services .landing-section-heading > span { max-width: 460px; }
  .landing-company__service-timeline { width: min(100%, 900px); margin: 0 auto; }
  .landing-roadmap__content { padding-right: 48px; padding-left: 48px; }
  .landing-footer__main { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 761px) and (max-height: 800px) {
  .landing-hero,
  .landing-hero__inner { min-height: 660px; }
  .landing-hero__inner { padding: 38px 0 126px; }
  .landing-hero h1 { font-size: clamp(42px, 4.1vw, 60px); }
  .landing-page.is-english .landing-hero h1 { font-size: clamp(39px, 3.8vw, 57px); }
}

@media (max-width: 760px) {
  .landing-header {
    min-height: 70px;
    grid-template-columns: 1fr auto;
    gap: 12px;
    padding: 0 16px;
  }

  .landing-brand__copy small { display: none; }
  .landing-brand__copy strong { font-size: 17px; }
  .landing-header__actions { gap: 6px; }
  .landing-language { transform: scale(0.9); transform-origin: right center; }
  .landing-entry-button { width: 40px; min-height: 38px; padding: 0; }
  .landing-entry-button span {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .landing-hero { min-height: 700px; }
  .landing-hero__inner {
    width: calc(100% - 36px);
    min-height: 700px;
    grid-template-columns: 1fr;
    align-content: center;
    padding: 42px 0 136px;
  }

  .landing-hero h1 { font-size: clamp(36px, 9.4vw, 49px); }
  .landing-page.is-english .landing-hero h1 { font-size: clamp(34px, 8.8vw, 47px); }
  .landing-hero__description { font-size: 14px; line-height: 1.65; }
  .landing-hero__actions { margin-top: 24px; }
  .landing-hero__angle--left { right: 4%; }
  .landing-hero__footer { right: 18px; bottom: 84px; left: 18px; }
  .landing-hero__pagination button { grid-template-columns: auto 28px; }
  .landing-hero__pagination button i { width: 28px; }
  .landing-hero__pagination { gap: 10px; }
  .landing-hero__arrows button { width: 42px; height: 42px; }

  .landing-capabilities { width: 100%; margin: 0; padding: 24px 14px 42px; }
  .landing-capabilities__layout { gap: 12px; }
  .landing-capabilities__grid { grid-template-columns: 1fr; }
  .landing-capabilities__aside { grid-template-columns: 1fr; }
  .landing-capability-card { min-height: 204px; }

  .landing-statement { padding: 90px 20px 74px; }
  .landing-section-heading h2 { font-size: 34px; }
  .landing-section-heading > span { font-size: 14px; }
  .landing-statement__actions { flex-direction: column; align-items: center; }
  .landing-pill { width: 100%; max-width: 360px; }
  .landing-statement__metrics { grid-template-columns: 1fr; margin-top: 52px; }
  .landing-statement__metrics div + div { border-top: 1px solid var(--landing-line); border-left: 0; }

  .landing-company { padding: 84px 20px 76px; }
  .landing-company__intro { gap: 50px; }
  .landing-company__identity h2 { font-size: 31px; }
  .landing-page.is-english .landing-company__identity h2 { font-size: 29px; }
  .landing-company__description { font-size: 14px; }
  .landing-company__actions { align-items: flex-start; flex-direction: column; gap: 15px; }
  .landing-company__registration { grid-template-columns: 1fr; }
  .landing-company__registration div { padding: 0 0 14px; }
  .landing-company__registration div + div { padding: 14px 0; border-top: 1px solid #e1e9f0; border-left: 0; }
  .landing-company__registration div:last-child { padding-bottom: 0; }
  .landing-company__operations { min-height: 350px; padding: 24px 18px; border-radius: 18px; }
  .landing-company__operations-route { gap: 7px; margin: 64px 0 48px; }
  .landing-company__operations-route > span b { min-width: 40px; min-height: 40px; padding: 0 6px; }
  .landing-company__operations-float { min-width: 126px; padding: 11px 12px; }
  .landing-company__operations-float--tracking { top: 76px; right: 12px; }
  .landing-company__operations-float--planning { right: 18px; bottom: -20px; }
  .landing-services { padding: 76px 20px; }
  .landing-services__inner { gap: 38px; }
  .landing-services__heading-orbit {
    width: min(100%, 430px);
    padding: 48px;
    box-shadow: 0 20px 52px rgba(24, 70, 105, 0.065), inset 0 0 0 12px rgba(255, 255, 255, 0.5);
  }
  .landing-services__heading-orbit::before { inset: 16px; }
  .landing-services .landing-section-heading h2 { font-size: clamp(28px, 8vw, 36px); }
  .landing-company__service-timeline { padding-left: 48px; }
  .landing-company__service-timeline::before {
    right: auto;
    left: 19px;
  }
  .landing-company__service-card,
  .landing-company__service-card:nth-child(odd),
  .landing-company__service-card:nth-child(even) {
    width: 100%;
    min-height: 142px;
    margin-right: 0;
    margin-left: 0;
    padding: 20px;
  }
  .landing-company__service-card:nth-child(odd)::before,
  .landing-company__service-card:nth-child(even)::before {
    right: auto;
    left: -29px;
    width: 29px;
  }
  .landing-company__service-card:nth-child(odd)::after,
  .landing-company__service-card:nth-child(even)::after {
    right: auto;
    left: -36px;
  }

  .landing-roadmap { grid-template-columns: 1fr; }
  .landing-roadmap__visual { min-height: 440px; }
  .landing-roadmap__console { width: calc(100% - 54px); }
  .landing-roadmap__content { padding: 70px 22px; }

  .landing-footer__main { grid-template-columns: 1fr; gap: 34px; padding: 52px 22px 42px; }
  .landing-footer__bottom { align-items: flex-start; flex-direction: column; padding: 20px 22px; }
}

@media (prefers-reduced-motion: reduce) {
  .landing-page { scroll-behavior: auto; }
  .landing-intro__page,
  .landing-intro__cover,
  .landing-intro__progress i,
  .landing-hero__pagination button.active i::after,
  .landing-company__operations-route > div b,
  .landing-company__service-timeline::before,
  .landing-company__service-card::after { animation: none; }
  .landing-hero-page-enter-active,
  .landing-hero-page-leave-active { transition-duration: 0.01ms; }
  .landing-page.is-reveal-ready .landing-reveal,
  .landing-page.is-reveal-ready .landing-reveal.is-visible {
    opacity: 1;
    translate: 0 0;
    animation: none;
  }
  .landing-capability-card,
  .landing-button,
  .landing-entry-button { transition: none; }
}
</style>
