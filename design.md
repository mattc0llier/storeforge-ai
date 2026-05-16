---
version: alpha
name: OpenAI
description: >-
  OpenAI's design system emphasizes clarity, precision, and accessibility through a minimalist monochromatic palette
  anchored by pure black CTAs. The interface prioritizes content and functionality over ornamentation, reflecting the
  brand's mission to make advanced AI research and tools universally accessible.
logo:
  src: https://openai.com/favicon.svg
colors:
  surface: '#ffffff'
  surface-dim: '#f5f5f5'
  surface-bright: '#ffffff'
  surface-container-lowest: '#fafafa'
  surface-container-low: '#f0f0f0'
  surface-container: '#e9ecef'
  surface-container-high: '#e0e0e0'
  surface-container-highest: '#d0d0d0'
  on-surface: '#0d0d0d'
  on-surface-variant: '#505050'
  inverse-surface: '#1a1a1a'
  inverse-on-surface: '#ffffff'
  outline: '#6c757d'
  outline-variant: '#adb5bd'
  surface-tint: '#000000'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1a1a1a'
  on-primary-container: '#ffffff'
  inverse-primary: '#ffffff'
  primary-fixed: '#0d0d0d'
  primary-fixed-dim: '#1a1a1a'
  on-primary-fixed: '#ffffff'
  on-primary-fixed-variant: '#f5f5f5'
  secondary: '#505050'
  on-secondary: '#ffffff'
  secondary-container: '#e9ecef'
  on-secondary-container: '#0d0d0d'
  secondary-fixed: '#6c757d'
  secondary-fixed-dim: '#505050'
  on-secondary-fixed: '#ffffff'
  on-secondary-fixed-variant: '#e9ecef'
  tertiary: '#f0f9fa'
  on-tertiary: '#0d0d0d'
  tertiary-container: '#cce0fe'
  on-tertiary-container: '#0d0d0d'
  tertiary-fixed: '#e9ecef'
  tertiary-fixed-dim: '#d0d0d0'
  on-tertiary-fixed: '#0d0d0d'
  on-tertiary-fixed-variant: '#505050'
  error: '#d32f2f'
  on-error: '#ffffff'
  error-container: '#ffcdd2'
  on-error-container: '#b71c1c'
  background: '#ffffff'
  on-background: '#0d0d0d'
  surface-variant: '#e9ecef'
typography:
  display:
    fontFamily: OpenAI Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
    fontSize: 60px
    fontWeight: '700'
    lineHeight: 68px
    letterSpacing: '-0.02em'
  headline-lg:
    fontFamily: OpenAI Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: '-0.01em'
  headline-md:
    fontFamily: OpenAI Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: 0em
  title-lg:
    fontFamily: OpenAI Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0em
  body-lg:
    fontFamily: OpenAI Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0em
  body-md:
    fontFamily: OpenAI Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  label-md:
    fontFamily: OpenAI Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: OpenAI Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 20px
  container-max: 1280px
elevation:
  sm: 0 1px 2px rgba(0, 0, 0, 0.06)
  md: 0 3px 8px rgba(0, 0, 0, 0.15)
  lg: 0 8px 24px rgba(0, 0, 0, 0.12)
layout:
  containerMaxWidth: 1280px
  gridColumns: 12
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.label-md}'
    rounded: '{rounded.full}'
    padding: 0 20px
    height: 40px
    border: none
    fontWeight: '500'
  button-primary-hover:
    backgroundColor: '{colors.primary-container}'
    textColor: '{colors.on-primary}'
    transition: background-color 200ms ease-in-out
  button-secondary:
    backgroundColor: rgba(0, 0, 0, 0.04)
    textColor: '{colors.on-surface}'
    typography: '{typography.label-sm}'
    rounded: '{rounded.full}'
    padding: 8px 16px
    height: 36px
    border: 1px solid transparent
  button-secondary-hover:
    backgroundColor: '{colors.surface-container-high}'
    textColor: '{colors.on-surface}'
    transition: background-color 200ms ease-in-out
  button-tertiary:
    backgroundColor: transparent
    textColor: '{colors.on-surface}'
    typography: '{typography.label-md}'
    rounded: '{rounded.lg}'
    padding: '{spacing.sm}'
    border: 1px solid {colors.outline-variant}
  button-tertiary-hover:
    backgroundColor: '{colors.surface-container}'
    borderColor: '{colors.outline}'
  input-field:
    backgroundColor: rgba(0, 0, 0, 0)
    textColor: '{colors.on-surface}'
    typography: '{typography.body-md}'
    rounded: '{rounded.full}'
    padding: 10px 24px 10px 52px
    border: 1px solid {colors.outline-variant}
    height: 44px
  input-field-focus:
    borderColor: '{colors.primary}'
    boxShadow: 0 0 0 3px rgba(0, 0, 0, 0.08)
    outline: none
  card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.md}'
    padding: '{spacing.md}'
    border: 1px solid {colors.surface-variant}
    boxShadow: '{elevation.sm}'
  card-hover:
    backgroundColor: '{colors.surface-dim}'
    boxShadow: '{elevation.md}'
    transition: all 200ms ease-in-out
  dropdown-panel:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.md}'
    border: 1px solid {colors.surface-variant}
    boxShadow: '{elevation.md}'
    padding: '0'
    minWidth: 100%
    maxHeight: 300px
    overflowY: auto
  dropdown-option:
    backgroundColor: transparent
    textColor: '{colors.on-surface}'
    typography: '{typography.body-md}'
    padding: 6px 12px
    lineHeight: '1.5'
  dropdown-option-hover:
    backgroundColor: '{colors.tertiary}'
    textColor: '{colors.on-surface}'
  dropdown-option-selected:
    backgroundColor: '{colors.surface-container}'
    textColor: '{colors.on-surface}'
    fontWeight: '500'
  badge:
    backgroundColor: '{colors.secondary-container}'
    textColor: '{colors.on-secondary-container}'
    typography: '{typography.label-sm}'
    rounded: '{rounded.full}'
    padding: '{spacing.xs} {spacing.sm}'
    display: inline-block
  link:
    textColor: '{colors.primary}'
    typography: '{typography.body-md}'
    textDecoration: none
    borderBottom: 1px solid transparent
  link-hover:
    textDecoration: underline
    transition: text-decoration 150ms ease-in-out
---

## Overview

OpenAI's design system embodies "Functional Minimalism"—a philosophy that strips away decorative elements to reveal pure utility and clarity. The brand serves researchers, developers, and enterprises seeking to understand and deploy advanced AI systems; the interface prioritizes information hierarchy and task completion over visual flourish. The emotional response is one of confidence and accessibility: users encounter a clean, uncluttered canvas that signals expertise without intimidation. The voice is direct, precise, and human-centered. OpenAI avoids marketing hyperbole, preferring concrete language: "Build with our API" rather than "Unlock infinite possibilities." Tone examples: "Our research shows…" (authoritative), "Get started in minutes" (practical), "Learn more about safety" (transparent). The brand personality balances scientific rigor with approachability—speaking to both PhD researchers and business stakeholders without condescension.

## Colors

The color palette is deliberately austere: pure white (#ffffff) as the dominant surface, pure black (#000000) as the primary accent and all CTAs, and a carefully calibrated gray scale for supporting elements. Primary (#000000) is reserved exclusively for high-intent actions—the 'Try ChatGPT' button, critical links, and focus states—making every black element a visual call to action. Secondary (#505050) and outline (#6c757d) provide subtle hierarchy for disabled states, secondary navigation, and form labels without competing for attention. The surface stack (surface-container-lowest through surface-container-highest) uses incremental grays (#fafafa to #d0d0d0) to create depth through luminosity rather than color, supporting a clean information architecture. Tertiary (#f0f9fa) is reserved fo

## Typography

The type system uses OpenAI Sans (or system fallback: -apple-system, BlinkMacSystemFont, Segoe UI) across all scales, creating visual cohesion and reducing cognitive load. Display (60px, 700 weight, -0.02em tracking) anchors hero sections and major announcements; Headline-lg (40px, 600 weight) structures primary content sections; Body-md (16px, 400 weight, 24px line-height) is the workhorse for body copy, optimized for 50–75 characters per line on desktop. Label-md (14px, 500 weight, 0.01em tracking) is applied to button text and form labels, with slightly tighter tracking to reinforce their actionable nature. All type scales maintain a minimum line-height of 1.5 (24px for body-md) to ensure readability over extended reading. For small labels over busy backgrounds or in dense tables, apply

## Layout

The layout uses a 12-column grid with a maximum container width of 1280px, allowing content to breathe on large displays while maintaining focus on smaller screens. The gutter size is 20px, derived from max(20px, calc((var(--document-width) - 68rem) / 2)), ensuring responsive padding that scales with viewport. White-space is treated as a first-class design element: section separation uses lg spacing (40px) to create visual pauses between major content blocks; internal component spacing uses md (24px) for card padding and sm (12px) for form field spacing. The spacing scale (xs: 4px, sm: 12px, md: 24px, lg: 40px, xl: 64px) is applied consistently across all components, creating a predictable rhythm. Hero sections and call-to-action areas are centered with generous vertical padding (80–120px)

## Elevation & Depth

Depth is conveyed through subtle shadow and border treatments rather than layering or blur effects. Level 1 (Base): no shadow; elements sit flush on the white surface (#ffffff). Level 2 (Cards, Dropdowns): box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15), paired with a 1px solid border in {colors.surface-variant} (#e9ecef), creating a soft separation from the background. Level 3 (Modals, Elevated Panels): box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), with the same border treatment, signaling a higher z-index and stronger focus. Hover states transition shadows smoothly over 200ms (transition: box-shadow

## Shapes

The shape philosophy is "Geometric Precision"—rounded corners are used sparingly and purposefully to signal interactivity without softening the overall aesthetic. Buttons use border-radius: 9999px (full roundness) to create a distinctive pill shape that immediately reads as clickable; this is the most recognizable shape in the system. Input fields and dropdowns use border-radius: 9999px as well, creating visual consistency with buttons and reinforcing their interactive nature. Cards and panels use border-radius: 0.75rem (12px) for a subtle, professional roundness that avoids the playfulness of

## Components

### Action Elements
Buttons are the primary interaction mechanism and must be instantly recognizable. Button-primary uses backgroundColor: {colors.primary} (#000000), textColor: {colors.on-primary} (#ffffff), border-radius: 9999px, padding: 0 20px, height: 40px, and fontWeight: 500. On hover, transition to backgroundColor: {colors.primary-container} (#1a1a1a) over 200ms. Button-secondary uses backgroundColor: rgba(0, 0, 0, 0.04), border-radius: 9999px, padding: 8px 16px, height: 36px, and transitions to backgroundColor: {colors.surface-container-high} (#e0e0e0) on hover. Never use outline buttons as primary CTAs; reserve them for tertiary actions only. All buttons must have a minimum touch target of 44px height to meet accessibility standards.

### Containers & Surfaces
Cards use backgroun

## Do's and Don'ts

**Do**
- Do use pure black (#000000) exclusively for primary CTAs and high-intent actions; every black element must earn its place through functional necessity.
- Do maintain a minimum line-height of 1.5 (24px for body-md) and limit line length to 50–75 characters to ensure readability and reduce cognitive load.
- Do apply the full 12-column grid with 20px gutters and 1280px max-width; never break the grid for 'creative' layouts—consistency builds trust.
- Do use the spacing scale (xs/sm/md/lg/xl) consistently; never invent arbitrary padding or margin values outside the defined tokens.
- Do transition all interactive states (hover, focus, active) over 200ms using ease-in-out timing; abrupt changes feel broken.

**Don't**
- Don't introduce new colors outside the defined palette; the monochromatic aesthetic is the brand's signature—adding a teal accent or gradient destroys it.
- Don't use blur, glassmorphism, or semi-transparent overlays; clarity and legibility are non-negotiable in a research-focused brand.
- Don't apply rounded corners to structural elements (headers, footers, full-width sections); reserve roundness for interactive components and cards.
- Don't use more than two font weights in a single section; the system supports 400/500/600/700 only—avoid mixing weights for visual hierarchy.
- Don't create custom button shapes or sizes; always use the defined pill (9999px) or card (12px) radii and the 40px/36px height standards.
