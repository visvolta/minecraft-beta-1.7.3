import * as THREE from 'three';
import { MinecartEntity } from '../../entities/MinecartEntity.ts';
import type { TextureAtlas } from '../../assets/TextureAtlas';

export class MinecartRenderer {
    private readonly mesh: THREE.Group;
    private readonly plateMaterial: THREE.MeshBasicMaterial;

    public constructor(atlas: TextureAtlas) {
        this.mesh = new THREE.Group();
        this.plateMaterial = new THREE.MeshBasicMaterial({
            map: atlas.texture,
            side: THREE.DoubleSide
        });

        // Five-plate Beta model
        const thickness = 0.125;
        const width = 0.98;
        const length = 0.98;
        const height = 0.5;

        // Bottom
        const bottom = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, length), this.plateMaterial);
        bottom.position.y = thickness / 2;
        this.mesh.add(bottom);

        // Sides
        const sideNS = new THREE.BoxGeometry(width, height, thickness);
        const sideEW = new THREE.BoxGeometry(thickness, height, length);

        const north = new THREE.Mesh(sideNS, this.plateMaterial);
        north.position.set(0, height / 2, -length / 2);
        this.mesh.add(north);

        const south = new THREE.Mesh(sideNS, this.plateMaterial);
        south.position.set(0, height / 2, length / 2);
        this.mesh.add(south);

        const east = new THREE.Mesh(sideEW, this.plateMaterial);
        east.position.set(width / 2, height / 2, 0);
        this.mesh.add(east);

        const west = new THREE.Mesh(sideEW, this.plateMaterial);
        west.position.set(-width / 2, height / 2, 0);
        this.mesh.add(west);
    }

    public getGroup(): THREE.Group {
        return this.mesh;
    }

    public update(entity: MinecartEntity, alpha: number): void {
        const p = entity.previousPosition;
        const c = entity.position;
        this.mesh.position.set(
            p.x + (c.x - p.x) * alpha,
            p.y + (c.y - p.y) * alpha,
            p.z + (c.z - p.z) * alpha
        );
        
        // Yaw from motion
        if (Math.hypot(entity.velocity.x, entity.velocity.z) > 0.001) {
            this.mesh.rotation.y = Math.atan2(entity.velocity.x, entity.velocity.z);
        }
    }
}
