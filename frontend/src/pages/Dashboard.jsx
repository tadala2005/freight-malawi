import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Truck,
  Fuel,
  Gauge as GaugeIcon,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react';

import AppShell from '../components/Layout/AppShell.jsx';
import Card from '../components/UI/Card.jsx';
import Skeleton from '../components/UI/Skeleton.jsx';
import Modal from '../components/UI/Modal.jsx';
import Button from '../components/UI/Button.jsx';

import KpiCard from '../components/Dashboard/KpiCard.jsx';
import VehicleMap from '../components/Dashboard/VehicleMap.jsx';
import VehicleList from '../components/Dashboard/VehicleList.jsx';
import FuelGauge from '../components/Dashboard/FuelGauge.jsx';
import AlertPanel from '../components/Dashboard/AlertPanel.jsx';

import { VehicleAPI, AlertAPI, TripAPI } from '../api/endpoints.js';

import { subscribe } from '../socket/socket.js';
import { useToast } from '../context/ToastContext.jsx';

export default function Dashboard() {
  const { showToast } =
    useToast();

  const [vehicles, setVehicles] =
    useState([]);

  const [alerts, setAlerts] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [
    selectedVehicleId,
    setSelectedVehicleId,
  ] = useState(null);

  const [search, setSearch] =
    useState('');

  const [
    acknowledgingId,
    setAcknowledgingId,
  ] = useState(null);

  const [tripPrompt, setTripPrompt] =
    useState(null);

  const [tripForm, setTripForm] = useState({
    origin: '',
    destination: '',
    cargoType: 'General Freight',
    cargoDescription: '',
    cargoWeightKg: '',
    plannedDistanceKm: '',
    agreedPayment: '',
    fuelPricePerLitre: '',
    notes: '',
  });

  const [
    tripSaving,
    setTripSaving,
  ] = useState(false);

  const loadData =
    useCallback(async () => {
      const [
        vehiclesRes,
        alertsRes,
      ] = await Promise.all([
        VehicleAPI.list(),
        AlertAPI.list(),
      ]);

      const vehicleList =
        vehiclesRes.data.vehicles ||
        [];

      const alertList =
        alertsRes.data.alerts ||
        [];

      setVehicles(
        vehicleList
      );

      setAlerts(
        alertList
      );

      setSelectedVehicleId(
        (previous) =>
          previous ||
          vehicleList[0]?.id ||
          null
      );
    }, []);

  useEffect(() => {
    loadData()
      .finally(() =>
        setLoading(false)
      );
  }, [loadData]);

  useEffect(() => {
    const offUpdate =
      subscribe(
        'vehicle:update',
        (payload) => {
          setVehicles(
            (previous) =>
              previous.map(
                (vehicle) => {
                  if (
                    vehicle.id !==
                    payload.vehicleId
                  ) {
                    return vehicle;
                  }

                  return {
                    ...vehicle,

                    latest_fuel_percent:
                      payload.fuelPercent,

                    latest_fuel_litres:
                      payload.fuelLevelLitres,

                    latest_speed:
                      payload.speed,

                    latest_latitude:
                      payload.latitude,

                    latest_longitude:
                      payload.longitude,

                    latest_heading:
                      payload.heading,

                    latest_recorded_at:
                      payload.timestamp ||
                      new Date().toISOString(),

                    latest_engine_on:
                      payload.engineOn,

                    latest_load_weight_kg:
                      payload.loadWeightKg,
                  };
                }
              )
          );

        }
      );

    const offTripCreated = subscribe('trip:created', (trip) => {
      const vehicle = vehicles.find((item) => item.id === trip.vehicle_id);
      setTripPrompt({ vehicle: vehicle || { id: trip.vehicle_id, name: trip.vehicle_name, license_plate: trip.license_plate, driver_name: trip.driver_name || trip.vehicle_driver_name }, trip });
      setTripForm({
        origin: '',
        destination: '',
        cargoType: 'General Freight',
        cargoDescription: '',
        cargoWeightKg: trip.cargo_weight_kg ? String(trip.cargo_weight_kg) : '',
        plannedDistanceKm: '',
        agreedPayment: '',
        fuelPricePerLitre: '',
        notes: '',
      });
      showToast(`${trip.vehicle_name || 'Vehicle'} engine started — trip log required`, 'warning');
    });

    const offTripCompleted = subscribe('trip:completed', () => {
      showToast('Trip completed and report updated', 'success');
      loadData().catch(() => {});
    });

    const offAlert = subscribe('alert:new', (alert) => {
          setAlerts(
            (previous) => [
              {
                ...alert,
                created_at:
                  alert.createdAt ||
                  new Date().toISOString(),
              },

              ...previous,
            ]
          );
        }
      );

    return () => {
      offUpdate();
      offTripCreated();
      offTripCompleted();
      offAlert();
    };
  }, [showToast]);

  async function handleAcknowledge(
    alertId
  ) {
    setAcknowledgingId(
      alertId
    );

    try {
      await AlertAPI.acknowledge(
        alertId
      );

      setAlerts(
        (previous) =>
          previous.map(
            (alert) =>
              alert.id ===
              alertId
                ? {
                    ...alert,
                    acknowledged: 1,
                  }
                : alert
          )
      );

      showToast(
        'Alert acknowledged',
        'success'
      );
    } catch {
      showToast(
        'Could not acknowledge alert',
        'error'
      );
    } finally {
      setAcknowledgingId(
        null
      );
    }
  }

  function updateTripField(
    field,
    value
  ) {
    setTripForm(
      (current) => ({
        ...current,
        [field]: value,
      })
    );
  }

  async function saveTripLog() {
    if (!tripPrompt?.trip?.id) return;

    if (!tripForm.origin.trim() || !tripForm.destination.trim()) {
      showToast('Origin and destination are required', 'error');
      return;
    }

    setTripSaving(true);
    try {
      await TripAPI.update(tripPrompt.trip.id, {
        origin: tripForm.origin.trim(),
        destination: tripForm.destination.trim(),
        cargoType: tripForm.cargoType.trim(),
        cargoDescription: tripForm.cargoDescription.trim(),
        cargoWeightKg: tripForm.cargoWeightKg === '' ? null : Number(tripForm.cargoWeightKg),
        plannedDistanceKm: tripForm.plannedDistanceKm === '' ? null : Number(tripForm.plannedDistanceKm),
        agreedPayment: tripForm.agreedPayment === '' ? 0 : Number(tripForm.agreedPayment),
        fuelPricePerLitre: tripForm.fuelPricePerLitre === '' ? null : Number(tripForm.fuelPricePerLitre),
        notes: tripForm.notes.trim(),
      });
      setTripPrompt(null);
      showToast('Trip logged and activated', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not save trip', 'error');
    } finally {
      setTripSaving(false);
    }
  }

  const activeVehicles =
    useMemo(
      () =>
        vehicles.filter(
          (vehicle) => {
            if (
              !vehicle.latest_recorded_at
            ) {
              return false;
            }

            return (
              Date.now() -
                new Date(
                  vehicle.latest_recorded_at
                ).getTime() <
              15 * 60 * 1000
            );
          }
        ).length,
      [vehicles]
    );

  const fleetFuelTotal =
    useMemo(
      () =>
        vehicles.reduce(
          (sum, vehicle) =>
            sum +
            Number(
              vehicle.latest_fuel_litres ||
                0
            ),
          0
        ),
      [vehicles]
    );

  const avgConsumption =
    3.3;

  const openAlerts =
    alerts.filter(
      (alert) =>
        !alert.acknowledged
    ).length;

  const criticalOpenAlerts =
    alerts.filter(
      (alert) =>
        !alert.acknowledged &&
        alert.severity ===
          'HIGH'
    ).length;

  const selectedVehicle =
    vehicles.find(
      (vehicle) =>
        vehicle.id ===
        selectedVehicleId
    );

  return (
    <AppShell
      title="Dashboard"
      searchValue={search}
      onSearchChange={
        setSearch
      }
    >
      <div className="kpi-grid">
        {loading ? (
          Array.from({
            length: 4,
          }).map(
            (_, index) => (
              <Skeleton
                key={index}
                height={92}
              />
            )
          )
        ) : (
          <>
            <KpiCard
              icon={Truck}
              label="Active Vehicles"
              value={
                activeVehicles
              }
              sub={`of ${vehicles.length} registered`}
            />

            <KpiCard
              icon={Fuel}
              label="Fleet Fuel"
              value={`${fleetFuelTotal.toFixed(
                0
              )} L`}
              sub="Latest reading per vehicle"
            />

            <KpiCard
              icon={GaugeIcon}
              label="Average Consumption"
              value={`${avgConsumption.toFixed(
                1
              )} km/L`}
              sub="Nominal fleet baseline"
            />

            <KpiCard
              icon={AlertTriangle}
              label="Open Alerts"
              value={openAlerts}
              sub={`${criticalOpenAlerts} critical`}
              danger={
                criticalOpenAlerts >
                0
              }
            />
          </>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="side-stack">
          <Card
            title="Live Fleet Map"
            className="map-card"
            bodyClassName="map-card-body"
          >
            {loading ? (
              <Skeleton
                height={420}
              />
            ) : (
              <VehicleMap
                vehicles={
                  vehicles
                }
                selectedVehicleId={
                  selectedVehicleId
                }
                onSelectVehicle={
                  setSelectedVehicleId
                }
              />
            )}
          </Card>

          <Card title="Fleet Vehicles">
            {loading ? (
              <Skeleton
                height={160}
              />
            ) : (
              <VehicleList
                vehicles={
                  vehicles
                }
                selectedVehicleId={
                  selectedVehicleId
                }
                onSelectVehicle={
                  setSelectedVehicleId
                }
                searchValue={
                  search
                }
              />
            )}
          </Card>
        </div>

        <div className="side-stack">
          <Card
            title={
              selectedVehicle
                ? `${selectedVehicle.name} — Fuel Level`
                : 'Fuel Level'
            }
          >
            {loading ? (
              <Skeleton
                height={160}
              />
            ) : selectedVehicle ? (
              <FuelGauge
                percent={Number(
                  selectedVehicle.latest_fuel_percent ||
                    0
                )}
                litres={Number(
                  selectedVehicle.latest_fuel_litres ||
                    0
                )}
                capacity={Number(
                  selectedVehicle.fuel_tank_capacity
                )}
              />
            ) : (
              <p className="card-subtitle">
                Select a vehicle
                to view its fuel
                gauge.
              </p>
            )}
          </Card>

          <Card
            title="Recent Alerts"
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  (window.location.href =
                    '/alerts')
                }
              >
                <ClipboardList size={15} />
                View all
              </Button>
            }
          >
            {loading ? (
              <Skeleton
                height={200}
              />
            ) : (
              <AlertPanel
                alerts={alerts.slice(
                  0,
                  10
                )}
                onAcknowledge={
                  handleAcknowledge
                }
                acknowledgingId={
                  acknowledgingId
                }
              />
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(
          tripPrompt
        )}
        title={
          tripPrompt
            ? `Log trip — ${tripPrompt.vehicle.name}`
            : 'Log trip'
        }
        onClose={() =>
          setTripPrompt(null)
        }
        onConfirm={
          saveTripLog
        }
        confirmLabel="Log Trip"
        confirmLoading={
          tripSaving
        }
      >
        <p
          className="card-subtitle"
          style={{
            marginBottom: 16,
          }}
        >
          Engine start detected.
          Record the trip details
          before the vehicle
          departs.
        </p>

        <div className="form-group">
          <label
            className="form-label"
            htmlFor="trip-origin"
          >
            Origin
          </label>

          <input
            id="trip-origin"
            className="form-input"
            value={
              tripForm.origin
            }
            onChange={(event) =>
              updateTripField(
                'origin',
                event.target.value
              )
            }
          />
        </div>

        <div className="form-group">
          <label
            className="form-label"
            htmlFor="trip-destination"
          >
            Destination
          </label>

          <input
            id="trip-destination"
            className="form-input"
            value={
              tripForm.destination
            }
            onChange={(event) =>
              updateTripField(
                'destination',
                event.target.value
              )
            }
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="trip-cargo-type">Cargo type</label>
          <input id="trip-cargo-type" className="form-input" value={tripForm.cargoType} onChange={(event) => updateTripField('cargoType', event.target.value)} />
        </div>

        <div className="form-group">
          <label
            className="form-label"
            htmlFor="trip-cargo"
          >
            Cargo description
          </label>

          <input
            id="trip-cargo"
            className="form-input"
            value={
              tripForm.cargoDescription
            }
            onChange={(event) =>
              updateTripField(
                'cargoDescription',
                event.target.value
              )
            }
            placeholder="e.g. maize, fertilizer, general freight"
          />
        </div>

        <div className="form-group">
          <label
            className="form-label"
            htmlFor="trip-weight"
          >
            Cargo weight (kg)
          </label>

          <input
            id="trip-weight"
            type="number"
            min="0"
            className="form-input"
            value={
              tripForm.cargoWeightKg
            }
            onChange={(event) =>
              updateTripField(
                'cargoWeightKg',
                event.target.value
              )
            }
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="trip-distance">Planned distance (km)</label>
          <input id="trip-distance" type="number" min="0" className="form-input" value={tripForm.plannedDistanceKm} onChange={(event) => updateTripField('plannedDistanceKm', event.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="trip-revenue">Agreed payment / revenue (MWK)</label>
          <input id="trip-revenue" type="number" min="0" className="form-input" value={tripForm.agreedPayment} onChange={(event) => updateTripField('agreedPayment', event.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="trip-fuel-price">Fuel price per litre (MWK)</label>
          <input id="trip-fuel-price" type="number" min="0" className="form-input" value={tripForm.fuelPricePerLitre} onChange={(event) => updateTripField('fuelPricePerLitre', event.target.value)} />
        </div>

        <div
          className="form-group"
          style={{
            marginBottom: 0,
          }}
        >
          <label
            className="form-label"
            htmlFor="trip-notes"
          >
            Notes
          </label>

          <textarea
            id="trip-notes"
            className="form-input"
            rows="3"
            value={
              tripForm.notes
            }
            onChange={(event) =>
              updateTripField(
                'notes',
                event.target.value
              )
            }
            placeholder="Optional trip notes"
            style={{
              height: 'auto',
              paddingTop: 10,
              paddingBottom: 10,
              resize: 'vertical',
            }}
          />
        </div>
      </Modal>
    </AppShell>
  );
}