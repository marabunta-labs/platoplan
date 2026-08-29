/**
 * PlatoPlan - Sidebar navigator for desktop/wide viewports
 * Uses @react-navigation/drawer with a permanent (always visible) drawer.
 * Provides the same screens as the bottom tab navigator.
 */

import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type {
  MainTabParamList,
  RecipeStackParamList,
  PantryStackParamList,
  PlanningStackParamList,
  ShoppingStackParamList,
} from './types';

import { PantryScreen } from '../screens/pantry/PantryScreen';
import { SuggestedRecipesScreen } from '../screens/pantry/SuggestedRecipesScreen';
import { ShoppingListScreen } from '../screens/shopping/ShoppingListScreen';

import {
  RecipeListScreen,
  RecipeDetailScreen,
  RecipeFormScreen,
} from '../screens/recipes';

import {
  PlanConfigScreen,
  PlanHistoryScreen,
  RecipeSelectionScreen,
  PlanCalendarScreen,
} from '../screens/planning';

// --- Stack navigators (same as AppNavigator) ---

const RecipeStack = createNativeStackNavigator<RecipeStackParamList>();

function RecipeStackNavigator() {
  return (
    <RecipeStack.Navigator screenOptions={{ headerShown: false }}>
      <RecipeStack.Screen name="RecipeList" component={RecipeListScreen} />
      <RecipeStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
      <RecipeStack.Screen name="RecipeForm" component={RecipeFormScreen} />
    </RecipeStack.Navigator>
  );
}

const PantryStack = createNativeStackNavigator<PantryStackParamList>();

function PantryStackNavigator() {
  return (
    <PantryStack.Navigator screenOptions={{ headerShown: false }}>
      <PantryStack.Screen name="PantryList" component={PantryScreen} />
      <PantryStack.Screen name="SuggestedRecipes" component={SuggestedRecipesScreen} />
    </PantryStack.Navigator>
  );
}

const PlanningStack = createNativeStackNavigator<PlanningStackParamList>();

function PlanningStackNavigator() {
  return (
    <PlanningStack.Navigator initialRouteName="PlanHistory" screenOptions={{ headerShown: false }}>
      <PlanningStack.Screen name="PlanHistory" component={PlanHistoryScreen} />
      <PlanningStack.Screen name="PlanConfig" component={PlanConfigScreen} />
      <PlanningStack.Screen name="RecipeSelection" component={RecipeSelectionScreen} />
      <PlanningStack.Screen name="PlanCalendar" component={PlanCalendarScreen} />
    </PlanningStack.Navigator>
  );
}

const ShoppingStack = createNativeStackNavigator<ShoppingStackParamList>();

function ShoppingStackNavigator() {
  return (
    <ShoppingStack.Navigator screenOptions={{ headerShown: false }}>
      <ShoppingStack.Screen name="ShoppingList" component={ShoppingListScreen} />
    </ShoppingStack.Navigator>
  );
}

import { useI18n } from '../i18n';

// --- Drawer navigator ---

const Drawer = createDrawerNavigator<MainTabParamList>();

export function SidebarNavigator() {
  const { t } = useI18n();

  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerType: 'permanent',
        drawerStyle: {
          width: 240,
        },
      }}
    >
      <Drawer.Screen
        name="RecipesTab"
        component={RecipeStackNavigator}
        options={{ drawerLabel: t('navigation.recipes') }}
      />
      <Drawer.Screen
        name="PantryTab"
        component={PantryStackNavigator}
        options={{ drawerLabel: t('navigation.pantry') }}
      />
      <Drawer.Screen
        name="PlanningTab"
        component={PlanningStackNavigator}
        options={{ drawerLabel: t('navigation.planning') }}
      />
      <Drawer.Screen
        name="ShoppingTab"
        component={ShoppingStackNavigator}
        options={{ drawerLabel: t('navigation.shopping') }}
      />
    </Drawer.Navigator>
  );
}
